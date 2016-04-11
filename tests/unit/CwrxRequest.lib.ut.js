describe('CwrxRequest(appCreds)', function() {
    'use strict';

    var CwrxRequest = require('../../lib/CwrxRequest');
    var requestUtils = require('cwrx/lib/requestUtils');
    var q = require('q');
    var inspect = require('util').inspect;

    it('should exist', function() {
        expect(CwrxRequest).toEqual(jasmine.any(Function));
        expect(CwrxRequest.name).toBe('CwrxRequest');
    });

    describe('instance:', function() {
        var cwrxRequest;
        var appCreds;

        beforeEach(function() {
            appCreds = {
                key: 'watchman-app',
                secret: 'dwieydh8349hrd8374hr483uery8fh347'
            };

            cwrxRequest = new CwrxRequest(appCreds);
        });

        describe('properties:', function() {
            describe('creds', function() {
                it('should be a copy of the provided credentials', function() {
                    expect(cwrxRequest.creds).toEqual(appCreds);
                    expect(cwrxRequest.creds).not.toBe(appCreds);
                    expect(Object.isFrozen(cwrxRequest.creds)).toBe(true, 'cwrxRequest.creds is not frozen.');
                });
            });
        });

        describe('methods:', function() {
            describe('send(method, options)', function() {
                var method, options;
                var makeSignedRequestDeferred;
                var success, failure;

                beforeEach(function(done) {
                    method = 'post';
                    options = {
                        json: false,
                        url: 'http://33.33.33.10/api/account/orgs',
                        qs: {
                            foo: 'bar'
                        }
                    };

                    success = jasmine.createSpy('success()');
                    failure = jasmine.createSpy('failure()');

                    spyOn(requestUtils, 'makeSignedRequest').and.returnValue((makeSignedRequestDeferred = q.defer()).promise);

                    cwrxRequest.send(method, options).then(success, failure);
                    process.nextTick(done);
                });

                it('should make a signed request', function() {
                    expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith(cwrxRequest.creds, method, options);
                });

                describe('if the request fails', function() {
                    var reason;

                    beforeEach(function(done) {
                        reason = new Error('Something bad happened!');

                        makeSignedRequestDeferred.reject(reason);
                        process.nextTick(done);
                    });

                    it('should reject the promise with a RequestError', function() {
                        var error = failure.calls.mostRecent().args[0];

                        expect(failure).toHaveBeenCalledWith(new Error(inspect(reason)));
                        expect(error.name).toBe('RequestError');
                        expect(error.cause).toBe(reason);
                    });
                });

                describe('if the request succeeds', function() {
                    var response, body;
                    var statusCode;

                    function test(statusCode) {
                        describe('with a statusCode of ' + statusCode, function() {
                            beforeEach(function(done) {
                                response.statusCode = statusCode;

                                makeSignedRequestDeferred.fulfill({ response: response, body: body });
                                process.nextTick(done);
                            });

                            if (statusCode >= 200 && statusCode <= 299) {
                                it('should fulfill the promise with an Array containing the body and response', function() {
                                    expect(success).toHaveBeenCalledWith([body, response]);
                                });
                            } else {
                                it('should reject the promise with a StatusCodeError', function() {
                                    var error = failure.calls.mostRecent().args[0];

                                    expect(failure).toHaveBeenCalledWith(new Error(statusCode + ' - ' + inspect(body)));
                                    expect(error.name).toBe('StatusCodeError');
                                    expect(error.statusCode).toBe(statusCode);
                                });
                            }
                        });
                    }

                    beforeEach(function() {
                        response = {};
                        body = [
                            { data: 'yes, this is data.' }
                        ];
                    });

                    for (statusCode = 100; statusCode < 600; statusCode++) {
                        test(statusCode);
                    }
                });

                describe('if the json option is not specified', function() {
                    beforeEach(function(done) {
                        requestUtils.makeSignedRequest.calls.reset();

                        options = {};

                        cwrxRequest.send(method, options).then(success, failure);
                        process.nextTick(done);
                    });

                    it('should set json to true', function() {
                        expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith(cwrxRequest.creds, method, { json: true });
                    });
                });

                describe('if options is a String', function() {
                    beforeEach(function(done) {
                        requestUtils.makeSignedRequest.calls.reset();

                        options = 'http://33.33.33.10/api/account/orgs';

                        cwrxRequest.send(method, options).then(success, failure);
                        process.nextTick(done);
                    });

                    it('should treat the options as the URL', function() {
                        expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith(cwrxRequest.creds, method, { json: true, url: options });
                    });
                });
            });

            ['get', 'post', 'put', 'delete'].forEach(function(method) {
                describe(method + '(options)', function() {
                    var options;
                    var sendDeferred;
                    var result;

                    beforeEach(function() {
                        options = {
                            url: 'http://33.33.33.10/api/account/orgs',
                            qs: {}
                        };

                        spyOn(cwrxRequest, 'send').and.returnValue((sendDeferred = q.defer()).promise);

                        result = cwrxRequest[method](options);
                    });

                    it('should call send() with the proper method', function() {
                        expect(cwrxRequest.send).toHaveBeenCalledWith(method, options);
                    });

                    it('should return the promise returned by send()', function() {
                        expect(result).toBe(sendDeferred.promise);
                    });
                });
            });
        });
    });
});
