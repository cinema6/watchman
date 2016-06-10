'use strict';

var CwrxRequest = require('../../lib/CwrxRequest');
var Hubspot = require('../../lib/Hubspot.js');
var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var updateUser = require('../../src/actions/hubspot/update_user.js');

describe('update_user', function() {
    beforeEach(function() {
        this.config = {
            appCreds: { },
            cwrx: {
                api: {
                    root: 'https://root',
                    users: {
                        endpoint: 'users'
                    }
                }
            },
            state: {
                secrets: {
                    hubspot: {
                        key: 'demo'
                    }
                }
            }
        };
        this.event = {
            data: {
                user: {
                    id: 'u-123',
                    email: 'snail@mail.com',
                    firstName: 'Sebastian',
                    lastName: 'Snail'
                },
                campaign: {
                    user: 'u-123'
                }
            },
            options: {
                properties: {
                    foo: 'bar'
                }
            }
        };
        this.mockLog = {
            trace: jasmine.createSpy('trace'),
            info: jasmine.createSpy('info'),
            warn: jasmine.createSpy('warn'),
            error: jasmine.createSpy('error')
        };
        spyOn(Hubspot.prototype, 'getContactByEmail');
        spyOn(Hubspot.prototype, 'createContact');
        spyOn(Hubspot.prototype, 'updateContact');
        spyOn(logger, 'getLog').and.returnValue(this.mockLog);
        spyOn(CwrxRequest.prototype, 'get');
        this.action = updateUser(this.config);
    });

    describe('the exported action factory', function() {
        it('should exist and be a function', function() {
            expect(updateUser).toEqual(jasmine.any(Function));
            expect(updateUser.name).toBe('factory');
        });

        it('should be able to create an action', function() {
            expect(this.action).toEqual(jasmine.any(Function));
            expect(this.action.name).toBe('action');
        });
    });

    it('should fetch the user from the campaign if not provided one', function(done) {
        delete this.event.data.user;
        CwrxRequest.prototype.get.and.returnValue(Q.resolve([{
            id: 'u-123',
            email: 'snail@mail.com',
            firstName: 'Sebastian',
            lastName: 'Snail'
        }]));
        this.action(this.event).then(function() {
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                url: 'https://root/users/u-123'
            });
            expect(Hubspot.prototype.getContactByEmail).toHaveBeenCalledWith('snail@mail.com');
        }).then(done, done.fail);
    });

    it('should check to see if a contact in Hubspot exists', function(done) {
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.resolve(null));
        Hubspot.prototype.createContact.and.returnValue(Q.resolve());
        this.action(this.event).then(function() {
            expect(Hubspot.prototype.getContactByEmail).toHaveBeenCalledWith('snail@mail.com');
        }).then(done, done.fail);
    });

    it('should be able to check the existance of a contact using an old email', function(done) {
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.resolve(null));
        Hubspot.prototype.createContact.and.returnValue(Q.resolve());
        this.event.data.oldEmail = 'old-snail@mail.com';
        this.action(this.event).then(function() {
            expect(Hubspot.prototype.getContactByEmail).toHaveBeenCalledWith('old-snail@mail.com');
        }).then(done, done.fail);
    });

    it('should log an error if checking the existance of the contact fails', function(done) {
        var self = this;
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.reject());
        self.action(self.event).then(function() {
            expect(self.mockLog.error).toHaveBeenCalled();
            expect(Hubspot.prototype.createContact).not.toHaveBeenCalled();
            expect(Hubspot.prototype.updateContact).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should create a contact in Hubspot if one doesn\'t exist', function(done) {
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.resolve(null));
        Hubspot.prototype.createContact.and.returnValue(Q.resolve());
        this.action(this.event).then(function() {
            expect(Hubspot.prototype.createContact).toHaveBeenCalledWith({
                properties: [
                    {
                        property: 'email',
                        value: 'snail@mail.com'
                    },
                    {
                        property: 'firstname',
                        value: 'Sebastian'
                    },
                    {
                        property: 'lastname',
                        value: 'Snail'
                    },
                    {
                        property: 'foo',
                        value: 'bar'
                    }
                ]
            });
            expect(Hubspot.prototype.updateContact).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should log an error if creating a contact fails', function(done) {
        var self = this;
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.resolve(null));
        Hubspot.prototype.createContact.and.returnValue(Q.reject());
        self.action(self.event).then(function() {
            expect(self.mockLog.error).toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should be able to update a contact in Hubspot with any given or changed user properties', function(done) {
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.resolve({ vid: 123 }));
        Hubspot.prototype.updateContact.and.returnValue(Q.resolve());
        this.action(this.event).then(function() {
            expect(Hubspot.prototype.updateContact).toHaveBeenCalledWith(123, {
                properties: [
                    {
                        property: 'email',
                        value: 'snail@mail.com'
                    },
                    {
                        property: 'firstname',
                        value: 'Sebastian'
                    },
                    {
                        property: 'lastname',
                        value: 'Snail'
                    },
                    {
                        property: 'foo',
                        value: 'bar'
                    }
                ]
            });
        }).then(done, done.fail);
    });

    it('should log an error if updating a contact fails', function(done) {
        var self = this;
        Hubspot.prototype.getContactByEmail.and.returnValue(Q.resolve({ vid: 123 }));
        Hubspot.prototype.updateContact.and.returnValue(Q.reject());
        self.action(self.event).then(function() {
            expect(self.mockLog.error).toHaveBeenCalled();
        }).then(done, done.fail);
    });
});
