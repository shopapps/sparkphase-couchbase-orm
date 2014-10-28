/*
	Sparkphase Couchbase ORM Version 0.1.0
	Updated: Friday 17th October 2014
	Author: Jonathan Bristow <jonathanbristow@me.com>
	Repository: https://github.com/JonathanBristow/sparkphase-couchbase-orm
*/

var RSVP	  = require('RSVP'),					// Promises Library
	Reporter  = require('sparkphase-reporter'),     // Error Logger & Debugger
	Merge     = require('extend'),				    // Function For Merging Objects
	Flake     = require('flake-idgen'),  		    // Flake ID Generator
	IntFormat = require('biguint-format'),			// Int Formatter For Flake
	Moment    = require('moment'),					// Date & Time Formatting Library
	Validator = require('validator'),				// Validation Library
	BCrypt	  = require('bcrypt');					// BCrypt Hashing Library

/* Used To Set Properties In Nested Objects By Path */
function SetProperty (Obj, Path, Value) {
	var PList = Path.split('.');
	var PLength = PList.length;
	for(var i = 0; i < PLength-1; i++) {
	    var A = PList[i];
	    if( !Obj[A] ) Obj[A] = {}
	    Obj = Obj[A];
	}		
	Obj[PList[PLength-1]] = Value;
}

/* Used To Hash Strings */
function Crypt(Value) {
	return new RSVP.Promise(function(Resolve, Reject) {
		BCrypt.genSalt(10, function(E, Salt) {
			if (E) {
				Reject();
			} else {
				BCrypt.hash(Value, Salt, function(E, Hash) {
					if (E) {
						Reject();
					} else {
						Resolve(Hash);
					}
				});
			}		
		});	
	});
};

/* Used To Generate Flake IDs */
function GenerateFlakeID() {
	/* Generate ID */
	var FlakeInstanse = new Flake();
	return IntFormat(FlakeInstanse.next(), 'dec');	
}

/* Used To Save Documents To Couchbase */
function SaveDocument(Bucket, Obj, Resolve, Reject) {
	/* Attempt Save */
	Bucket.insert(Obj.ID, Obj, function(E, Result) {
		/* Check For Errors */
		if (E) {
			/* Is The ID Already In Use? */
			if (E.code == 12) {
				/* Generate New ID */
				Obj.ID = GenerateFlakeID();
				/* Retry */
				Save(Bucket, Obj, Resolve, Reject);
			} else {
				/* Report */
				Reporter({
					'Type': 'Error',
					'Group': 'ORM',
					'Message':'Error Saving To Database',
					'Detail': {Message: E, ID: Obj.ID, Document: Obj}
				});
				/* Reject */
				Reject('Error Saving To Database');
			}
		} else {
			/* Resolve */
			Resolve(Obj);
		}
	});	
}

module.exports = function(Bucket) {
	
	/* ORM */
	ORM = function() {
		this.Bucket = {};
		this.ViewQuery = {};
		this.Models = {};
		this.Slices = {};
		return this;
	}
	
	/* Public Methods */	
	ORM.prototype.Setup = function(Bucket, ViewQuery) {
		this.Bucket = Bucket;
		this.ViewQuery = ViewQuery;
		return new RSVP.Promise(function(Resolve, Reject) {	
			Reporter({
				'Type': 'Information',
				'Group': 'ORM',
				'Message': 'Couchbase ORM Started'
			});	
			Resolve();
		});	
	}
	ORM.prototype.Import = function(Models) {
		var ModelCount = 0,
			SliceCount = 0,
			Keys = Object.keys(Models);			
		for (Index = 0; Index < Keys.length; ++Index) {
		    if (Models[Keys[Index]]) {
		    	switch(Models[Keys[Index]].Type) {
			    	case 'Model':
			    		this.Models[Keys[Index]] = Models[Keys[Index]];
						ModelCount++;
			    	break;
			    	case 'Slice':
			    		this.Slices[Keys[Index]] = Models[Keys[Index]];
						SliceCount++;
			    	break;
			    	default: 
			    		Reporter({
							'Type': 'Error',
							'Group': 'ORM',
							'Message':'Invalid Model Type'
						});
			    	break;
		    	}		   	
		    } 
			if (Index+1 == Keys.length) {
			    Reporter({
					'Type': 'Information',
					'Group': 'ORM',
					'Message': ModelCount+' Model(s) Imported'
				});	
				 Reporter({
					'Type': 'Information',
					'Group': 'ORM',
					'Message': SliceCount+' Slices(s) Imported'
				});					
		    } 
		}
	}			
	ORM.prototype.Attr = function(Method, Type, Options) {
		var Me = this;
		if (!Options) {
			Options = {}
		};
		switch (Method) {
			case 'New': 
				switch (Type) {
					case 'Type':
						if (Options.Default) {return Options.Default;} else {return "";};
					break;
					case 'UUID':
						return GenerateFlakeID();
					break;
					case 'String':
						if (Options.Default) {return Options.Default;} else {return "";};
					break;
					case 'Date':
						return new Date().toISOString();
					break;
					case 'Boolen':
						return false;
					break;
					case 'Array':
						return [];
					break;
					case 'Object':
						if (Options.Contains) {
							if (this.Slices[Options.Contains]) {
								return this.Slices[Options.Contains].Structure('New');
							} else {
								Reporter({
									'Type': 'Error',
									'Group': 'ORM',
									'Message':'Unable To Find Slice: '+Options.Contains
								});
								return {};
							}							
						} else {
							return {};
						}
					break;
				}
			break;
			case 'Blank':
				return "";
			break;
			default:
				Reporter({
					'Type': 'Error',
					'Group': 'ORM',
					'Message':'Unknown Method: '+Method
				});
				return false;
			break;
		}
	}	
	ORM.prototype.Create = function(Method, Name, Data, ID) {
		var Me = this;
		return new RSVP.Promise(function(Resolve, Reject) {	
			/* We use a try here to catch any errors which get thrown when creating the models. 
			   These are quite likly to come from the Attr() function.
			*/
			try {
				if (Me.Models[Name]) {
				var Model = Me.Models[Name];				
				if (Method == "New") {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'New '+Name+' Requested'
					});
					Resolve(Model.Structure('New'));
				} else if (Method == "Blank") {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Blank '+Name+' Requested'
					});
					Resolve(Model.Structure('Blank'));									
				} else if (Method == "Rebuild" && typeof Data == "object") {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Rebuilt '+Name+' Requested'
					});
					Resolve(Merge(true, Model.Structure, Data));									
				} else if (Method == "Find" && typeof Data == "string" && ID) {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Find "'+Name+'" With View "'+Model.ViewGroup+'.'+Data+'" And Key "'+ID+'"'
					});
					if (Model.Views.indexOf(Data) == 1) {
						var Query = Me.ViewQuery.from(Model.ViewGroup, Data).stale(Me.ViewQuery.Update.BEFORE).key(ID);
						Me.Query(Query).then(function(Document) {
							if (Document) {
								Reporter({
									'Type': 'Debug',
									'Group': 'ORM',
									'Message': Document.length+' Result(s) For "'+ID+'" Using View "'+Model.ViewGroup+'.'+Data+'"'
								});							
								Resolve(Document);
							} else {
								Reporter({
									'Type': 'Debug',
									'Group': 'ORM',
									'Message': 'No Results For "'+ID+'" Using View "'+Model.ViewGroup+'.'+Data+'"'
								});							
								Reject('No Results');
							}	
						}, function() {							
							Reporter({
								'Type': 'Debug',
								'Group': 'ORM',
								'Message': 'Error Performing Query'
							});
							Reject('Error Performing Query');							
						});
					} else {
						Reporter({
							'Type': 'Debug',
							'Group': 'ORM',
							'Message': 'Invalid View Name Provided'
						});
						Reject('Invalid View Name Provided');
					}							
				} else {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Unknown Method Or Invalid Data Provided'
					});
					Reject('Unknown Method Or Invalid Data Provided');
				}
			} else {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Cannot Find Model '+Name
					});
					Reject('Cannot Find Model');
				}
			} catch (E) {
				/* Reject With Caught Error */
				Reject(E.message);
			}		
		});
	}
	ORM.prototype.Query = function(Query) {
		var Me = this;
		return new RSVP.Promise(function(Resolve, Reject) {
			Me.Bucket.query(Query, function(E, Document) {			
				if(E) {
					Reporter({
						'Type': 'Error',
						'Group': 'Couchbase',
						'Message': 'Unable To Perform View Query',
						'Detail': E
					});
					Reject(E);
				} else if(Document.length == 0) {
					Resolve(false);
				} else {
					Resolve(Document);			
				}	
			});	
		});
	}	
	ORM.prototype.ByID = function(ID) {
		var Me = this;
		return new RSVP.Promise(function(Resolve, Reject) {
			Me.Bucket.get(ID, function(E, Document) {			
				if (E) {
					Reject(E);
				} else {
					Resolve(Document);
				}
			});	
		});
	}	
	ORM.prototype.Set = function(Obj, Path, Value, Type, Options) {
		var Me = this;
		return new RSVP.Promise(function(Resolve, Reject) {
			if (!Obj) Reject('Missing Object');
			if (!Path) Reject('Missing Path');
			if (!Value) Reject('Missing Value');
			if (!Type) Reject('Missing Type');
			if (!Options) Options = {};
			if (!Obj[Path]) {
				SetProperty(Obj, Path, false);
			}
			switch (Type) {
				case 'Email': 
					if (Validator.isEmail(Value)) { 
						SetProperty(Obj, Path, Value);
						Resolve(Obj);
					} else {
						Reject('Invalid Email Address');
					}
				break;
				case 'Password': 
					if (Validator.isLength(Value, 6, 100)) {
						Crypt(Value).then(function(Value) {
							SetProperty(Obj, Path, Value);
							Resolve(Obj);						
						}, function() {
							Reject('Unable To Crypt Password');;	
						});
					} else {
						Reject('Invalid Password');;
					}
				break;				
				case 'Date': 
					if (Moment(Value).isValid()) {
						SetProperty(Obj, Path, Value);
						Resolve(Obj);
					} else {
						Reject('Invalid Date');;
					}
				break;
				case 'String': 
					/* Set Default Options */
					if (!Options.Min) Options.Min = 1;
					if (!Options.Max) Options.Max = 1000;
					/* Validate */
					if (Validator.isLength(Value, Options.Min, Options.Max)) { 
						SetProperty(Obj, Path, Value);
						Resolve(Obj);
					} else {
						Reject('Incorrect String Length');
					}
				break;
				default:
					/* Reject Promise */
					Reject('Invalid Type');
				break;
			}
		});
	}
	ORM.prototype.Save = function(Obj) {
		var Me = this;
		return new RSVP.Promise(function(Resolve, Reject) {
			if (!Obj.ID) {
				Reject('Invalid ID');
			} else {
				SaveDocument(Me.Bucket, Obj, Resolve, Reject);				
			}
		});
	}
	
	return new ORM;
}