var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');
var submitForm = require('../../src/actions/hubspot/submit_form.js');
var url = require('url');

describe('submit_form', function() {
    'use strict';

    beforeEach(function() {
        this.event = {
            data: {
                user: {
                    firstName: 'John',
                    lastName: 'Smith',
                    email: 'JohnSmith@fake.com'
                }
            },
            options: {
                portal: 'portal_id',
                form: 'form_id'
            }
        };
        this.config = { };
        this.mockLog = {
            trace: jasmine.createSpy('trace'),
            info: jasmine.createSpy('info'),
            warn: jasmine.createSpy('warn'),
            error: jasmine.createSpy('error')
        };
        spyOn(requestUtils, 'qRequest');
        spyOn(logger, 'getLog').and.returnValue(this.mockLog);
        this.action = submitForm(this.config);
    });

    it('should export an action factory', function() {
        expect(submitForm).toEqual(jasmine.any(Function));
        expect(submitForm.name).toBe('factory');
    });

    it('should be able to create an action', function() {
        expect(this.action).toEqual(jasmine.any(Function));
        expect(this.action.name).toBe('action');
    });

    it('should be able to submit a Hubspot form with a tracking cookie', function(done) {
        this.event.data.hubspot = { hutk: 'chocolate-chip' };
        requestUtils.qRequest.and.returnValue(Q.resolve({
            response: {
                statusCode: 204
            }
        }));
        this.action(this.event).then(function() {
            expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                uri: 'https://forms.hubspot.com/uploads/form/v2/portal_id/form_id',
                body: url.format({
                    query: {
                        firstname: 'John',
                        lastname: 'Smith',
                        email: 'JohnSmith@fake.com',
                        /* jshint camelcase:false */
                        hs_context: '{"hutk":"chocolate-chip"}'
                        /* jshint camelcase:true */
                    }
                }).slice(1)
            });
        }).then(done, done.fail);
    });

    it('should be able to submit a Hubspot form without a tracking cookie', function(done) {
        requestUtils.qRequest.and.returnValue(Q.resolve({
            response: {
                statusCode: 302
            }
        }));
        this.action(this.event).then(function() {
            expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                uri: 'https://forms.hubspot.com/uploads/form/v2/portal_id/form_id',
                body: url.format({
                    query: {
                        firstname: 'John',
                        lastname: 'Smith',
                        email: 'JohnSmith@fake.com',
                        /* jshint camelcase:false */
                        hs_context: '{}'
                        /* jshint camelcase:true */
                    }
                }).slice(1)
            });
        }).then(done, done.fail);
    });

    it('should be able to submit a form with data from the action\'s options', function(done) {
        this.event.options.data = {
            foo: 'bar'
        };
        requestUtils.qRequest.and.returnValue(Q.resolve({
            response: {
                statusCode: 302
            }
        }));
        this.action(this.event).then(function() {
            expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                uri: 'https://forms.hubspot.com/uploads/form/v2/portal_id/form_id',
                body: url.format({
                    query: {
                        firstname: 'John',
                        lastname: 'Smith',
                        email: 'JohnSmith@fake.com',
                        foo: 'bar',
                        /* jshint camelcase:false */
                        hs_context: '{}'
                        /* jshint camelcase:true */
                    }
                }).slice(1)
            });
        }).then(done, done.fail);
    });

    it('should reject if not provided with a portal id', function(done) {
        delete this.event.options.portal;
        this.action(this.event).then(done.fail).catch(function(error) {
            expect(error).toBeDefined();
        }).then(done, done.fail);
    });

    it('should reject if not provided with a form id', function(done) {
        delete this.event.options.form;
        this.action(this.event).then(done.fail).catch(function(error) {
            expect(error).toBeDefined();
        }).then(done, done.fail);
    });

    it('should error if a failing status code was returned', function(done) {
        var self = this;
        requestUtils.qRequest.and.returnValue(Q.resolve({
            response: {
                statusCode: 500
            },
            body: 'epic fail'
        }));
        self.action(self.event).then(function() {
            expect(self.mockLog.error).toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should reject if the form fails to be submitted', function(done) {
        requestUtils.qRequest.and.returnValue(Q.reject('epic fail'));
        this.action(this.event).then(done.fail).catch(function(error) {
            expect(error).toBe('epic fail');
        }).then(done, done.fail);
    });
});
