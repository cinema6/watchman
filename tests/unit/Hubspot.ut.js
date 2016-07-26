'use strict';

const Hubspot = require('../../lib/Hubspot.js');
const Q = require('q');
const requestUtils = require('cwrx/lib/requestUtils.js');
const ld = require('lodash');

const wait = global.setTimeout;

describe('Hubspot', function() {
    beforeEach(function() {
        spyOn(requestUtils, 'qRequest');
        this.hubspot = new Hubspot('key');
    });

    it('should accept an api key in its constructor', function() {
        var hubspot = new Hubspot('key');
        expect(hubspot).toEqual(jasmine.any(Object));
    });

    it('should throw an error if not passed an api key', function(done) {
        try {
            new Hubspot();
            done.fail();
        } catch(error) {
            done();
        }
    });

    describe('getting a contact by its email', function() {
        it('should work', function(done) {
            requestUtils.qRequest.and.returnValue(Q.resolve({
                response: {
                    statusCode: 200
                },
                body: 'body'
            }));
            this.hubspot.getContactByEmail('email').then(function(body) {
                expect(requestUtils.qRequest).toHaveBeenCalledWith('get', {
                    uri: 'https://api.hubapi.com/contacts/v1/contact/email/email/profile?hapikey=key'
                });
                expect(body).toBe('body');
            }).then(done, done.fail);
        });

        it('should resolve with null if there is no such contact', function(done) {
            requestUtils.qRequest.and.returnValue(Q.resolve({
                response: {
                    statusCode: 404
                },
                body: 'body'
            }));
            this.hubspot.getContactByEmail('email').then(function(body) {
                expect(body).toBe(null);
            }).then(done, done.fail);
        });

        it('should reject if Hubspot responds with an unsuccessful status code', function(done) {
            var response = {
                response: {
                    statusCode: 500
                },
                body: 'body'
            };
            requestUtils.qRequest.and.returnValue(Q.resolve(response));
            this.hubspot.getContactByEmail('email').then(done.fail).catch(function(error) {
                expect(error).toBeDefined();
            }).then(done, done.fail);
        });

        it('should reject if it fails', function(done) {
            requestUtils.qRequest.and.returnValue(Q.reject('epic fail'));
            this.hubspot.getContactByEmail('email').then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
            }).then(done, done.fail);
        });
    });

    describe('deleting a contact', function() {
        it('should work', function(done) {
            requestUtils.qRequest.and.returnValue(Q.resolve({
                response: {
                    statusCode: 200
                },
                body: 'body'
            }));
            this.hubspot.deleteContact(123).then(function(body) {
                expect(requestUtils.qRequest).toHaveBeenCalledWith('delete', {
                    uri: 'https://api.hubapi.com/contacts/v1/contact/vid/123?hapikey=key'
                });
                expect(body).toBe('body');
            }).then(done, done.fail);
        });

        it('should reject if Hubspot responds with an unsuccessful status code', function(done) {
            var response = {
                response: {
                    statusCode: 500
                },
                body: 'body'
            };
            requestUtils.qRequest.and.returnValue(Q.resolve(response));
            this.hubspot.deleteContact(123).then(done.fail).catch(function(error) {
                expect(error).toBeDefined();
            }).then(done, done.fail);
        });

        it('should reject if it fails', function(done) {
            requestUtils.qRequest.and.returnValue(Q.reject('epic fail'));
            this.hubspot.deleteContact(123).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
            }).then(done, done.fail);
        });
    });

    describe('updating a contact', function() {
        it('should work', function(done) {
            requestUtils.qRequest.and.returnValue(Q.resolve({
                response: {
                    statusCode: 204
                },
                body: 'body'
            }));
            this.hubspot.updateContact(123, {
                foo: 'bar'
            }).then(function(body) {
                expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                    uri: 'https://api.hubapi.com/contacts/v1/contact/vid/123/profile?hapikey=key',
                    json: {
                        foo: 'bar'
                    }
                });
                expect(body).toBe('body');
            }).then(done, done.fail);
        });

        it('should reject if Hubspot responds with an unsuccessful status code', function(done) {
            var response = {
                response: {
                    statusCode: 500
                },
                body: 'body'
            };
            requestUtils.qRequest.and.returnValue(Q.resolve(response));
            this.hubspot.updateContact(123, {
                foo: 'bar'
            }).then(done.fail).catch(function(error) {
                expect(error).toBeDefined();
            }).then(done, done.fail);
        });

        it('should reject if it fails', function(done) {
            requestUtils.qRequest.and.returnValue(Q.reject('epic fail'));
            this.hubspot.updateContact(123, {
                foo: 'bar'
            }).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
            }).then(done, done.fail);
        });
    });

    describe('creating a contact', function() {
        it('should work', function(done) {
            requestUtils.qRequest.and.returnValue(Q.resolve({
                response: {
                    statusCode: 200
                },
                body: 'body'
            }));
            this.hubspot.createContact({
                foo: 'bar'
            }).then(function(body) {
                expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                    uri: 'https://api.hubapi.com/contacts/v1/contact?hapikey=key',
                    json: {
                        foo: 'bar'
                    }
                });
                expect(body).toBe('body');
            }).then(done, done.fail);
        });

        it('should reject if Hubspot responds with an unsuccessful status code', function(done) {
            var response = {
                response: {
                    statusCode: 500
                },
                body: 'body'
            };
            requestUtils.qRequest.and.returnValue(Q.resolve(response));
            this.hubspot.createContact({
                foo: 'bar'
            }).then(done.fail).catch(function(error) {
                expect(error).toBeDefined();
            }).then(done, done.fail);
        });

        it('should reject if it fails', function(done) {
            requestUtils.qRequest.and.returnValue(Q.reject('epic fail'));
            this.hubspot.createContact({
                foo: 'bar'
            }).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
            }).then(done, done.fail);
        });
    });

    describe('making a hubspot request', function() {
        beforeEach(function() {
            this.waitZero = () => new Promise(function(resolve) {
                wait(() => {
                    resolve();
                }, 0);
            });
            spyOn(ld, 'random').and.callThrough();
            jasmine.clock().install();
        });

        afterEach(function() {
            jasmine.clock().uninstall();
        });

        it('should retry the request if it was rate limited', function(done) {
            let calls = 0;
            requestUtils.qRequest.and.callFake(() => {
                return Promise.resolve({
                    response: {
                        statusCode: calls++ === 0 ? 429 : 200
                    }
                });
            });
            this.hubspot.getContactByEmail('foo@bar.com');
            expect(requestUtils.qRequest.calls.count()).toBe(1);
            this.waitZero().then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 2000);
                jasmine.clock().tick(2000);
                return this.waitZero();
            }).then(() => {
                expect(requestUtils.qRequest.calls.count()).toBe(2);
            }).then(done, done.fail);
        });

        it('should be able to retry the request more than once with increasing random delay times', function(done) {
            let calls = 0;
            requestUtils.qRequest.and.callFake(() => {
                return Promise.resolve({
                    response: {
                        statusCode: calls++ < 2 ? 429 : 200
                    }
                });
            });
            this.hubspot.getContactByEmail('foo@bar.com');
            expect(requestUtils.qRequest.calls.count()).toBe(1);
            this.waitZero().then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 2000);
                jasmine.clock().tick(2000);
                return this.waitZero();
            }).then(() => {
                expect(requestUtils.qRequest.calls.count()).toBe(2);
                expect(ld.random).toHaveBeenCalledWith(1000, 3000);
                jasmine.clock().tick(3000);
                return this.waitZero();
            }).then(() => {
                expect(requestUtils.qRequest.calls.count()).toBe(3);
            }).then(done, done.fail);
        });

        it('should be able to resolve once the request succeeds', function(done) {
            let calls = 0;
            requestUtils.qRequest.and.callFake(() => {
                return Promise.resolve({
                    response: {
                        statusCode: calls++ < 3 ? 429 : 200
                    }
                });
            });
            const promise = this.hubspot.getContactByEmail('foo@bar.com');
            this.waitZero().then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 2000);
                jasmine.clock().tick(2000);
                return this.waitZero();
            }).then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 3000);
                jasmine.clock().tick(3000);
                return this.waitZero();
            }).then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 4000);
                jasmine.clock().tick(4000);
                return this.waitZero();
            }).then(() => {
                return promise;
            }).then(() => {
                expect(requestUtils.qRequest.calls.count()).toBe(4);
            }).then(done, done.fail);
        });

        it('should retry the request up to a max number of times before it rejects', function(done) {
            requestUtils.qRequest.and.callFake(() => {
                return Promise.resolve({
                    response: {
                        statusCode: 429
                    }
                });
            });
            const promise = this.hubspot.getContactByEmail('foo@bar.com');
            this.waitZero().then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 2000);
                jasmine.clock().tick(2000);
                return this.waitZero();
            }).then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 3000);
                jasmine.clock().tick(3000);
                return this.waitZero();
            }).then(() => {
                expect(ld.random).toHaveBeenCalledWith(1000, 4000);
                jasmine.clock().tick(4000);
                return this.waitZero();
            }).then(() => {
                return promise;
            }).then(done.fail, error => {
                expect(error.code).toBe(429);
            }).then(done, done.fail);
        });
    });
});
