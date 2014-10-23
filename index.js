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
	Moment    = require('moment');					// Date & Time Formatting Library

module.exports = function(Bucket) {
	
	ORM = function() {
		this.Bucket = {};
		this.ViewQuery = {};
		this.Models = {};
		return this;
	}
	
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
		var Count = 0;
		var Keys = Object.keys(Models);			
		for (Index = 0; Index < Keys.length; ++Index) {
		    if (Models[Keys[Index]]) {
			   	this.Models[Keys[Index]] = Models[Keys[Index]];
				Count++;
		    } 
			if (Index+1 == Keys.length) {
			    Reporter({
					'Type': 'Information',
					'Group': 'ORM',
					'Message': Count+' Model(s) Imported'
				});					
		    } 
		}	
	}	
		
	ORM.prototype.Attr = function(Method, Type, Options) {
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
						var ID = new Flake();
						return IntFormat(ID.next(), 'dec');
					break;
					case 'String':
						if (Options.Default) {return Options.Default;} else {return "";};
					break;
					case 'Date':
						return Moment();
					break;
					case 'Boolen':
						return false;
					break;
					case 'Array':
						return [];
					break;
					case 'Object':
						return {};
					break;
				}
			break;
			case 'Blank':
				return "";
			break;
		}
	}
	
	ORM.prototype.Create = function(Method, Name, Data, ID) {
		var Me = this;
		return new RSVP.Promise(function(Resolve, Reject) {	
			if (Me.Models[Name]) {
				var Model = Me.Models[Name];				
				if (Method == "New") {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'New Model '+Name+' Requested'
					});
					Resolve(Model.Structure('New'));
				} else if (Method == "Blank") {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Blank Model '+Name+' Requested'
					});
					Resolve(Model.Structure('Blank'));									
				} else if (Method == "Rebuild" && typeof Data == "object") {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Rebuilt Model '+Name+' Requested'
					});
					Resolve(Merge(true, Model.Structure, Data));									
				} else if (Method == "Find" && typeof Data == "string" && ID) {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Find Model '+Name+' Requested Using View '+Data+' And Key '+ID
					});
					if (Model.Views.indexOf(Data) == 1) {
						var Query = Me.ViewQuery.from(Model.ViewGroup, Data).stale(Me.ViewQuery.Update.BEFORE).key(ID);
						Me.Query(Query).then(function(Document) {
							if (Document) {
								
								/* Result Found */
								
								
							} else {
								Reporter({
									'Type': 'Debug',
									'Group': 'ORM',
									'Message': 'No Results For '+ID+' In View: '+Model.ViewGroup+'.'+Data
								});							
								Reject();
							}	
						}, function() {							
							Reporter({
								'Type': 'Debug',
								'Group': 'ORM',
								'Message': 'Error Performing Query'
							});
							Reject();							
						});
					} else {
						Reporter({
							'Type': 'Debug',
							'Group': 'ORM',
							'Message': 'Invalid View Name Provided'
						});
						Reject();
					}							
				} else {
					Reporter({
						'Type': 'Debug',
						'Group': 'ORM',
						'Message': 'Unknown Method Or Invalid Data Provided'
					});
					Reject();
				}
			} else {
				Reporter({
					'Type': 'Debug',
					'Group': 'ORM',
					'Message': 'Cannot Find Model '+Name
				});
				Reject();
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
	
	return new ORM;
}