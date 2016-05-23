'use strict';

/* jshint maxlen:false */

var Q = require('q');
var fs = require('fs');
var handlebars = require('handlebars');
var htmlToText = require('html-to-text');
var logger = require('cwrx/lib/logger.js');
var nodemailer = require('nodemailer');
var path = require('path');
var proxyquire = require('proxyquire').noCallThru();
var requestUtils = require('cwrx/lib/requestUtils.js');
var uuid = require('rc-uuid');
var resolveURL = require('url').resolve;

describe('campaign_email.js', function() {
    var emailFactory;
    var email;
    var data;
    var options;
    var config;
    var mockLog;
    var mockTransport;

    beforeEach(function() {
        data = { };
        options = { };
        config = {
            appCreds: {
                key: 'watchman-dev',
                secret: 'dwei9fhj3489ghr7834909r'
            },
            cwrx: {
                api: {
                    root: 'http://33.33.33.10/',
                    users: {
                        endpoint: '/api/account/users'
                    },
                    advertisers: {
                        endpoint: '/api/account/advertisers'
                    }
                }
            }
        };
        mockLog = {
            warn: jasmine.createSpy('warn()')
        };
        mockTransport = jasmine.createSpy('sesTransport()');
        emailFactory = proxyquire('../../src/actions/message/campaign_email.js', {
            'nodemailer-ses-transport': mockTransport
        });
        email = emailFactory(config);
        spyOn(fs, 'readFile');
        spyOn(fs, 'stat');
        spyOn(handlebars, 'compile');
        spyOn(htmlToText, 'fromString');
        spyOn(requestUtils, 'makeSignedRequest');
        spyOn(logger, 'getLog').and.returnValue(mockLog);
        spyOn(nodemailer, 'createTransport');
        spyOn(emailFactory.__private__, 'loadTemplate');
        spyOn(emailFactory.__private__, 'getRecipient');
        spyOn(emailFactory.__private__, 'getSubject');
        spyOn(emailFactory.__private__, 'getHtml');
        spyOn(emailFactory.__private__, 'getAttachments');
    });

    describe('loadTemplate', function() {
        beforeEach(function() {
            emailFactory.__private__.loadTemplate.and.callThrough();
        });

        it('should attempt to read the template file', function(done) {
            fs.readFile.and.callFake(function(path, options, callback) {
                callback(null);
            });
            emailFactory.__private__.loadTemplate('template.html').then(function() {
                var args = fs.readFile.calls.mostRecent().args;
                expect(args[0]).toContain('/templates/template.html');
                expect(args[1]).toEqual({
                    encoding: 'utf8'
                });
                expect(args[2]).toEqual(jasmine.any(Function));
                done();
            }).catch(done.fail);
        });

        it('should be able to resolve with the contents of the file', function(done) {
            fs.readFile.and.callFake(function(path, options, callback) {
                callback(null, 'data');
            });
            emailFactory.__private__.loadTemplate('template.html').then(function(data) {
                expect(data).toBe('data');
                done();
            }).catch(done.fail);
        });

        it('should reject if reading the file fails', function(done) {
            fs.readFile.and.callFake(function(path, options, callback) {
                callback('epic fail');
            });
            emailFactory.__private__.loadTemplate('template.html').then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });
    });

    describe('getRecipient', function() {
        beforeEach(function() {
            emailFactory.__private__.getRecipient.and.callThrough();
            config.emails = {
                supportAddress: 'support@reelcontent.com'
            };
        });

        describe('when the "toSupport" option is true', function() {
            it('should resolve with its value', function(done) {
                options.toSupport = true;
                emailFactory.__private__.getRecipient(data, options, config).then(function(recipient) {
                    expect(recipient).toBe('support@reelcontent.com');
                    done();
                }).catch(done.fail);
            });
        });

        describe('when the "to" option is specified', function() {
            it('should resolve with its value', function(done) {
                options.to = 'a@gmail.com';
                emailFactory.__private__.getRecipient(data, options, config).then(function(recipient) {
                    expect(recipient).toBe('a@gmail.com');
                    done();
                }).catch(done.fail);
            });
        });

        describe('when there exists a user on the data object', function() {
            it('should resolve with their email', function(done) {
                data.user = {
                    email: 'a@gmail.com'
                };
                emailFactory.__private__.getRecipient(data, options, config).then(function(recipient) {
                    expect(recipient).toBe('a@gmail.com');
                    done();
                }).catch(done.fail);
            });
        });

        describe('when there is a campaign on the data object', function() {
            describe('the request for the user', function() {
                it('should be made correctly', function(done) {
                    data.campaign = {
                        user: 'u-123'
                    };
                    config.appCreds = 'creds';
                    config.cwrx = {
                        api: {
                            root: 'http://root',
                            users: {
                                endpoint: '/users'
                            }
                        }
                    };
                    emailFactory.__private__.getRecipient(data, options, config).then(done.fail)
                        .catch(function() {
                            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('creds',
                                'get', {
                                    fields: 'email',
                                    json: true,
                                    url: 'http://root/users/u-123',
                                });
                            done();
                        });
                });

                describe('when it responds with a 200', function() {
                    beforeEach(function() {
                        requestUtils.makeSignedRequest.and.returnValue(Q.resolve({
                            response: {
                                statusCode: 200
                            },
                            body: {
                                email: 'a@gmail.com'
                            }
                        }));
                    });

                    it('should resolve with the user\'s email', function(done) {
                        data.campaign = {
                            user: 'u-123'
                        };
                        config.cwrx = {
                            api: {
                                users: { }
                            }
                        };
                        emailFactory.__private__.getRecipient(data, options, config)
                            .then(function(recipient) {
                                expect(recipient).toBe('a@gmail.com');
                                done();
                            }).catch(done.fail);
                    });
                });

                describe('when it does not respond with a 200', function() {
                    beforeEach(function() {
                        requestUtils.makeSignedRequest.and.returnValue(Q.resolve({
                            response: {
                                statusCode: 500
                            },
                            body: 'epic fail'
                        }));
                    });

                    it('should log a warning and reject', function(done) {
                        data.campaign = {
                            user: 'u-123'
                        };
                        config.cwrx = {
                            api: {
                                users: { }
                            }
                        };
                        emailFactory.__private__.getRecipient(data, options, config)
                            .then(done.fail).catch(function(error) {
                                expect(mockLog.warn).toHaveBeenCalled();
                                expect(error).toBeDefined();
                                done();
                            });
                    });
                });

                describe('when it fails', function() {
                    beforeEach(function() {
                        requestUtils.makeSignedRequest.and.returnValue(Q.reject('epic fail'));
                    });

                    it('should reject with the failure reason', function(done) {
                        data.campaign = {
                            user: 'u-123'
                        };
                        config.cwrx = {
                            api: {
                                users: { }
                            }
                        };
                        emailFactory.__private__.getRecipient(data, options, config)
                            .then(done.fail)
                            .catch(function(error) {
                                expect(error).toBe('epic fail');
                                done();
                            });
                    });
                });
            });
        });

        describe('when there is an org in the data', function() {
            var success, failure;
            var getUsersDeferred;

            beforeEach(function(done) {
                config = {
                    appCreds: {
                        key: 'watchman-dev',
                        secret: 'dwei9fhj3489ghr7834909r'
                    },
                    cwrx: {
                        api: {
                            root: 'http://33.33.33.10/',
                            users: {
                                endpoint: '/api/account/users'
                            },
                            advertisers: {
                                endpoint: '/api/account/advertisers'
                            }
                        }
                    }
                };
                data = {
                    org: {
                        id: 'o-' + uuid.createUuid()
                    }
                };
                options = {};

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                requestUtils.makeSignedRequest.and.returnValue((getUsersDeferred = Q.defer()).promise);
                requestUtils.makeSignedRequest.calls.reset();

                emailFactory.__private__.getRecipient(data, options, config).then(success, failure);
                process.nextTick(done);
            });

            it('should make a request for the org\'s users', function() {
                expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith(config.appCreds, 'get', {
                    url: resolveURL(config.cwrx.api.root, config.cwrx.api.users.endpoint),
                    qs: { org: data.org.id, fields: 'email', sort: 'created,1' }
                });
            });

            describe('if the request fails', function() {
                var reason;

                beforeEach(function(done) {
                    reason = new Error('Something bad happened.');
                    getUsersDeferred.reject(reason);

                    process.nextTick(done);
                });

                it('should reject the Promise', function() {
                    expect(failure).toHaveBeenCalledWith(reason);
                });
            });

            describe('if the request succeeds', function() {
                var result, body, response;

                describe('with a failing status code', function() {
                    beforeEach(function(done) {
                        body = 'INTERNAL ERROR';
                        response = { statusCode: 500 };
                        result = { response: response, body: body };

                        getUsersDeferred.fulfill(result);
                        process.nextTick(done);
                    });

                    it('should reject the Promise', function() {
                        expect(failure).toHaveBeenCalledWith(new Error('Failed to get users for org ' + data.org.id + ': ' + body));
                    });
                });

                describe('with a 200', function() {
                    beforeEach(function(done) {
                        body = [{ id: 'u-' + uuid.createUuid(), email: 'some.shmuck@reelcontent.com' }];
                        response = { statusCode: 200 };
                        result = { response: response, body: body };

                        getUsersDeferred.fulfill(result);
                        process.nextTick(done);
                    });

                    it('should fulfill with the first user\'s email', function() {
                        expect(success).toHaveBeenCalledWith(body[0].email);
                    });
                });
            });
        });

        describe('when there is no way to get a recipient', function() {
            it('should reject with an error', function(done) {
                emailFactory.__private__.getRecipient(data, options, config)
                    .then(done.fail)
                    .catch(function(error) {
                        expect(error).toBeDefined();
                        done();
                    });
            });
        });
    });

    describe('getSubject', function() {
        var getSubject;

        beforeEach(function() {
            emailFactory.__private__.getSubject.and.callThrough();
            getSubject = emailFactory.__private__.getSubject;
        });

        it('should get the subject for campaignExpired emails', function() {
            expect(getSubject('campaignExpired')).toBe('Your Campaign Has Ended');
        });

        it('should get the subject for campaignReachedBudget emails', function() {
            expect(getSubject('campaignReachedBudget')).toBe('Your Campaign is Out of Budget');
        });

        it('should get the subject for campaignApproved emails', function() {
            expect(getSubject('campaignApproved')).toBe('Reelcontent Campaign Approved');
        });

        it('should get the subject for campaignUpdateApproved emails', function() {
            expect(getSubject('campaignUpdateApproved')).toBe(
                'Your Campaign Change Request Has Been Approved');
        });

        it('should get the subject for campaignRejected emails', function() {
            expect(getSubject('campaignRejected')).toBe('Reelcontent Campaign Rejected');
        });

        it('should get the subject for campaignUpdateRejected emails', function() {
            expect(getSubject('campaignUpdateRejected')).toBe(
                'Your Campaign Change Request Has Been Rejected');
        });

        it('should get the subject for chargePaymentPlanFailure emails', function() {
            expect(getSubject('chargePaymentPlanFailure')).toBe('We Hit a Snag');
        });

        describe('getting the subject of newUpdateRequest emails', function() {
            it('should be able to use the company of the user', function() {
                data.campaign = {
                    name: 'Nombre'
                };
                data.user = {
                    company: 'Evil Corp'
                };
                expect(getSubject('newUpdateRequest', data)).toBe(
                    'New update request from Evil Corp for campaign "Nombre"');
            });

            it('should be able to use the name of the user', function() {
                data.campaign = {
                    name: 'Nombre'
                };
                data.user = {
                    firstName: 'Patrick',
                    lastName: 'Star'
                };
                expect(getSubject('newUpdateRequest', data)).toBe(
                    'New update request from Patrick Star for campaign "Nombre"');
            });

            it('should be able to use the key of an application', function() {
                data.campaign = {
                    name: 'Nombre'
                };
                data.application = {
                    key: 'app-key'
                };
                expect(getSubject('newUpdateRequest', data)).toBe(
                    'New update request from app-key for campaign "Nombre"');
            });
        });

        it('should get the subject for paymentMade emails', function() {
            expect(getSubject('paymentMade')).toBe(
                'Your payment has been approved');
        });

        describe('if the type is "activateAccount"', function() {
            var type, data;

            beforeEach(function() {
                type = 'activateAccount';
                data = { user: { firstName: 'Emma' } };
            });

            describe('and the data has no target', function() {
                it('should be a subject for selfie', function() {
                    expect(getSubject(type, data)).toBe('Emma, Welcome to Reelcontent');
                });

                it('should be a different subject if the user has no first name', function() {
                    delete data.user.firstName;
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent');
                    delete data.user;
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent');
                });
            });

            describe('and the target is selfie', function() {
                beforeEach(function() {
                    data.target = 'selfie';
                });

                it('should be a subject for selfie', function() {
                    expect(getSubject(type, data)).toBe('Emma, Welcome to Reelcontent');
                });

                it('should be a different subject if the user has no first name', function() {
                    delete data.user.firstName;
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent');
                    delete data.user;
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent');
                });
            });

            describe('and the target is showcase', function() {
                beforeEach(function() {
                    data.target = 'showcase';
                });

                it('should be a subject for showcase', function() {
                    expect(getSubject(type, data)).toBe('Emma, Welcome to Reelcontent Apps');
                });

                it('should be a different subject if the user has no first name', function() {
                    delete data.user.firstName;
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent Apps');
                    delete data.user;
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent Apps');
                });
            });
        });

        describe('the subject for accountWasActivated emails', function() {
            it('should include the user\'s name if it exists', function() {
                var data = { user: { firstName: 'Emma' } };
                expect(getSubject('accountWasActivated', data)).toBe('Emma, Your Reelcontent Account Is Ready To Go');
            });

            it('should not include a name if one does not exist on the user', function() {
                var data = { user: { } };
                expect(getSubject('accountWasActivated', data)).toBe('Your Reelcontent Account Is Ready To Go');
            });

            it('should not incldue a name if there is no user', function() {
                var data = { };
                expect(getSubject('accountWasActivated', data)).toBe('Your Reelcontent Account Is Ready To Go');
            });
        });

        it('should get the subject for passwordChanged emails', function() {
            expect(getSubject('passwordChanged')).toBe('Reelcontent Password Change Notice');
        });

        it('should get the subject for emailChanged emails', function() {
            expect(getSubject('emailChanged')).toBe('Your Email Has Been Changed');
        });

        it('should get the subject for failedLogins emails', function() {
            expect(getSubject('failedLogins')).toBe('Reelcontent: Multiple-Failed Logins');
        });

        it('should get the subject for forgotPassword emails', function() {
            expect(getSubject('forgotPassword')).toBe('Forgot Your Password?');
        });

        it('should get the subject for campaignActive emails', function() {
            var data = { campaign: { name: 'Amazing Campaign' } };
            expect(getSubject('campaignActive', data)).toBe('Amazing Campaign Is Now Live!');
        });

        it('should get the subject for campaignSubmitted emails', function() {
            var data = { campaign: { name: 'Amazing Campaign' } };
            expect(getSubject('campaignSubmitted', data)).toBe('We\'ve Got It! Amazing Campaign Has Been Submitted for Approval.');
        });

        it('should get the subject for initializedShowcaseCampaign', function() {
            var data = { campaign: { name: 'My Awesome App' } };
            expect(getSubject('initializedShowcaseCampaign', data)).toBe('New Showcase Campaign Started: ' + data.campaign.name);
        });

        it('should return an empty string for an unknown email type', function() {
            expect(getSubject('unknown email type')).toBe('');
        });
    });

    describe('getHtml', function() {
        var getHtml;
        var compileSpy;

        beforeEach(function() {
            emailFactory.__private__.getHtml.and.callThrough();
            getHtml = emailFactory.__private__.getHtml;
            compileSpy = jasmine.createSpy('compileSpy()');
            handlebars.compile.and.returnValue(compileSpy);
            emailFactory.__private__.loadTemplate.and.returnValue(Q.resolve('template'));
            config = {
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        users: {
                            endpoint: '/api/account/users'
                        },
                        advertisers: {
                            endpoint: '/api/account/advertisers'
                        }
                    }
                },
                emails: {
                    dashboardLink: 'dashboard link',
                    manageLink: 'manage link for campaign :campId',
                    reviewLink: 'review link for campaign :campId',
                    supportAddress: 'support@reelcontent.com',
                    passwordResetPages: {
                        portal: 'http://localhost:9000/#/password/reset',
                        selfie: 'http://localhost:9000/#/pass/reset?selfie=true',
                        showcase: 'http://localhost:9000/#/showcase/pass/reset'
                    },
                    forgotTargets: {
                        portal: 'http://localhost:9000/#/password/reset',
                        selfie: 'http://localhost:9000/#/pass/reset?selfie=true',
                        showcase: 'http://localhost:9000/#/showcase/pass/reset'
                    },
                    previewLink: 'preview link for campaign :campId',
                    beeswax: {
                        campaignLink: 'http://stingersbx.beeswax.com/advertisers/{{advertiserId}}/campaigns/{{campaignId}}/line_items'
                    }
                }
            };
        });

        it('should reject for an unknown email type', function(done) {
            getHtml('unknown email type', null, {}).then(done.fail).catch(function(error) {
                expect(error).toBeDefined();
                done();
            });
        });

        it('should be able to compile a campaignExpired email', function(done) {
            data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
            getHtml('campaignExpired', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith('campaignExpired.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    date: 'Friday, November 10, 2000',
                    dashboardLink: 'dashboard link',
                    manageLink: 'manage link for campaign c-123'
                });
                expect();
                done();
            }).catch(done.fail);
        });

        it('should be able to compile a campaignReachedBudget email', function(done) {
            data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
            getHtml('campaignReachedBudget', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                    'campaignOutOfBudget.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    date: 'Friday, November 10, 2000',
                    dashboardLink: 'dashboard link',
                    manageLink: 'manage link for campaign c-123'
                });
                expect();
                done();
            }).catch(done.fail);
        });

        it('should be able to compile a campaignApproved email', function(done) {
            data.campaign = {
                name: 'Nombre'
            };
            getHtml('campaignApproved', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                    'campaignApproved.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link'
                });
                expect();
                done();
            }).catch(done.fail);
        });

        it('should be able to compile a campaignUpdateApproved email', function(done) {
            data.campaign = {
                name: 'Nombre'
            };
            getHtml('campaignUpdateApproved', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                    'campaignUpdateApproved.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link'
                });
                expect();
                done();
            }).catch(done.fail);
        });

        it('should be able to compile a campaignRejected email', function(done) {
            data.campaign = {
                name: 'Nombre'
            };
            data.updateRequest = {
                rejectionReason: 'rejected'
            };
            getHtml('campaignRejected', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                    'campaignRejected.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link',
                    rejectionReason: 'rejected'
                });
                expect();
                done();
            }).catch(done.fail);
        });

        it('should be able to compile a campaignUpdateRejected email', function(done) {
            data.campaign = {
                name: 'Nombre'
            };
            data.updateRequest = {
                rejectionReason: 'rejected'
            };
            getHtml('campaignUpdateRejected', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                    'campaignUpdateRejected.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link',
                    rejectionReason: 'rejected'
                });
                expect();
                done();
            }).catch(done.fail);
        });

        describe('compiling a newUpdateRequest email', function() {
            it('should be able to use the email  of the user', function(done) {
                data.user = {
                    email: 'email@gmail.com'
                };
                data.campaign = {
                    id: 'c-123',
                    name: 'Nombre'
                };
                getHtml('newUpdateRequest', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'newUpdateRequest.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        requester: 'email@gmail.com',
                        campName: 'Nombre',
                        reviewLink: 'review link for campaign c-123'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should be able to use the application key', function(done) {
                data.application = {
                    key: 'app-key'
                };
                data.campaign = {
                    id: 'c-123',
                    name: 'Nombre'
                };
                getHtml('newUpdateRequest', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'newUpdateRequest.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        requester: 'app-key',
                        campName: 'Nombre',
                        reviewLink: 'review link for campaign c-123'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });
        });

        describe('compiling a paymentMade email', function() {
            beforeEach(function() {
                data.payment = {
                    id: 'pay1',
                    amount: 666.6612,
                    createdAt: '2016-04-04T19:06:11.821Z',
                    method: {
                        type: 'creditCard',
                        cardType: 'Visa',
                        cardholderName: 'Johnny Testmonkey',
                        last4: '1234'
                    }
                };
                data.user = {
                    id: 'u-1',
                    email: 'foo@test.com',
                    firstName: 'Randy'
                };
                data.balance = 9001.9876;
            });

            describe('selfie payment receipts', function() {
                it('should handle payments from credit cards', function(done) {
                    getHtml('paymentMade', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'paymentReceipt.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            amount: '$666.66',
                            isCreditCard: true,
                            method: {
                                type: 'creditCard',
                                cardType: 'Visa',
                                cardholderName: 'Johnny Testmonkey',
                                last4: '1234',
                            },
                            date: 'Monday, April 04, 2016',
                            billingEndDate: 'Tuesday, May 03, 2016',
                            balance: '$9001.99',
                            firstName: 'Randy'
                        });
                    }).then(done, done.fail);
                });

                it('should handle payments from paypal accounts', function(done) {
                    data.payment.method = { type: 'paypal', email: 'johnny@moneybags.com' };

                    getHtml('paymentMade', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'paymentReceipt.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            amount: '$666.66',
                            isCreditCard: false,
                            method: {
                                type: 'paypal',
                                email: 'johnny@moneybags.com'
                            },
                            date: 'Monday, April 04, 2016',
                            billingEndDate: 'Tuesday, May 03, 2016',
                            balance: '$9001.99',
                            firstName: 'Randy'
                        });
                    }).then(done, done.fail);
                });
            });

            describe('showcase payment receipts', function() {
                it('should handle payments from credit cards', function(done) {
                    getHtml('paymentMade', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'paymentReceipt.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            amount: '$666.66',
                            isCreditCard: true,
                            method: {
                                type: 'creditCard',
                                cardType: 'Visa',
                                cardholderName: 'Johnny Testmonkey',
                                last4: '1234',
                            },
                            date: 'Monday, April 04, 2016',
                            billingEndDate: 'Tuesday, May 03, 2016',
                            balance: '$9001.99',
                            firstName: 'Randy'
                        });
                    }).then(done, done.fail);
                });

                it('should handle payments from paypal accounts', function(done) {
                    data.payment.method = { type: 'paypal', email: 'johnny@moneybags.com' };

                    getHtml('paymentMade', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'paymentReceipt.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            amount: '$666.66',
                            isCreditCard: false,
                            method: {
                                type: 'paypal',
                                email: 'johnny@moneybags.com'
                            },
                            date: 'Monday, April 04, 2016',
                            billingEndDate: 'Tuesday, May 03, 2016',
                            balance: '$9001.99',
                            firstName: 'Randy'
                        });
                    }).then(done, done.fail);
                });
            });
        });

        describe('compiling an activateAccount email', function() {
            beforeEach(function() {
                config.emails.activationTargets = {
                    selfie: 'http://link.com',
                    showcase: 'http://showcase-link.com'
                };
                data.user = {
                    id: 'u-123'
                };
                data.token = 'token';
            });

            it('should handle the possibility of a url without query params', function(done) {
                getHtml('activateAccount', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'activateAccount.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        activationLink: 'http://link.com?id=u-123&token=token'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should handle the possibility of a url with query params', function(done) {
                config.emails.activationTargets.selfie = 'http://link.com?query=param';

                getHtml('activateAccount', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'activateAccount.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        activationLink: 'http://link.com?query=param&id=u-123&token=token'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            describe('if the target is selfie', function() {
                beforeEach(function() {
                    data.target = 'selfie';
                });

                it('should use the selfie template and data', function(done) {
                    getHtml('activateAccount', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'activateAccount.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            activationLink: 'http://link.com?id=u-123&token=token'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });

            describe('if the target is showcase', function() {
                beforeEach(function() {
                    data.target = 'showcase';
                });

                it('should use the showcase template and data', function(done) {
                    getHtml('activateAccount', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'activateAccount--app.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            activationLink: 'http://showcase-link.com?id=u-123&token=token'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });
        });

        it('should be able to compile a "chargePaymentPlanFailure" email', function(done) {
            data = {
                org: {
                    id: 'o-' + uuid.createUuid()
                },
                paymentPlan: {
                    price: 49.99
                },
                paymentMethod: {
                    type: 'creditCard',
                    cardType: 'MasterCard',
                    last4: '6738',
                    email: 'a.user@gmail.com'
                }
            };
            getHtml('chargePaymentPlanFailure', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith('chargePaymentPlanFailure.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    contact: config.emails.supportAddress,
                    amount: '$' + data.paymentPlan.price.toString(),
                    cardType: data.paymentMethod.cardType,
                    cardLast4: data.paymentMethod.last4,
                    paypalEmail: data.paymentMethod.email
                });
            }).then(done, done.fail);
        });

        describe('if the type is "accountWasActivated"', function() {
            var type;

            beforeEach(function() {
                type = 'accountWasActivated';
                config.emails.dashboardLinks = {
                    selfie: 'dashboard link',
                    showcase: 'showcase dashboard link'
                };
                data.user = {
                    firstName: 'Randy'
                };
            });

            describe('without a target', function() {
                it('should use the selfie template and data', function(done) {
                    getHtml('accountWasActivated', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'accountWasActivated.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            dashboardLink: 'dashboard link',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });

            describe('with a selfie target', function() {
                beforeEach(function() {
                    data.target = 'selfie';
                });

                it('should use the selfie template and data', function(done) {
                    getHtml('accountWasActivated', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'accountWasActivated.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            dashboardLink: 'dashboard link',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });

            describe('with a showcase target', function() {
                beforeEach(function() {
                    data.target = 'showcase';
                });

                it('should use the showcase template and data', function(done) {
                    getHtml('accountWasActivated', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'accountWasActivated--app.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            dashboardLink: 'showcase dashboard link',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });
        });

        describe('compiling a passwordChanged email', function() {
            beforeEach(function() {
                data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
                data.user = {
                    firstName: 'Randy'
                };
                config.emails.dashboardLinks = {
                    selfie: 'dashboard link',
                    showcase: 'showcase dashboard link'
                };
            });

            it('should work for selfie users', function(done) {
                getHtml('passwordChanged', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordChanged.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        date: 'Friday, November 10, 2000',
                        time: jasmine.stringMatching(/\d{2}:\d{2}:\d{2}.+/),
                        firstName: 'Randy',
                        dashboardLink: 'dashboard link'
                    });
                }).then(done, done.fail);
            });

            it('should work for showcase users', function(done) {
                data.target = 'showcase';
                getHtml('passwordChanged', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordChanged--app.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        date: 'Friday, November 10, 2000',
                        time: jasmine.stringMatching(/\d{2}:\d{2}:\d{2}.+/),
                        firstName: 'Randy',
                        dashboardLink: 'showcase dashboard link'
                    });
                }).then(done, done.fail);
            });
        });

        describe('compiling an emailChanged email', function() {
            describe('for selfie campaigns', function() {
                it('should be able to compile when sending to the new email address', function(done) {
                    data.user = {
                        email: 'new-email@gmail.com',
                        firstName: 'Randy'
                    };
                    data.newEmail = 'new-email@gmail.com';
                    data.oldEmail = 'old-email@gmail.com';
                    getHtml('emailChanged', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'emailChanged.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            newEmail: 'new-email@gmail.com',
                            oldEmail: 'old-email@gmail.com',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });

                it('should be able to compile when sending to the old email address', function(done) {
                    data.user = {
                        email: 'old-email@gmail.com',
                        firstName: 'Randy'
                    };
                    data.newEmail = 'new-email@gmail.com';
                    data.oldEmail = 'old-email@gmail.com';
                    getHtml('emailChanged', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'emailChanged.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            newEmail: 'new-email@gmail.com',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });

            describe('for showcase campaigns', function() {
                beforeEach(function() {
                    data.target = 'showcase';
                });

                it('should be able to compile when sending to the new email address', function(done) {
                    data.user = {
                        email: 'new-email@gmail.com',
                        firstName: 'Randy'
                    };
                    data.newEmail = 'new-email@gmail.com';
                    data.oldEmail = 'old-email@gmail.com';
                    getHtml('emailChanged', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'emailChanged--app.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            newEmail: 'new-email@gmail.com',
                            oldEmail: 'old-email@gmail.com',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });

                it('should be able to compile when sending to the old email address', function(done) {
                    data.user = {
                        email: 'old-email@gmail.com',
                        firstName: 'Randy'
                    };
                    data.newEmail = 'new-email@gmail.com';
                    data.oldEmail = 'old-email@gmail.com';
                    getHtml('emailChanged', data, config).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'emailChanged--app.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            contact: 'support@reelcontent.com',
                            newEmail: 'new-email@gmail.com',
                            oldEmail: 'old-email@gmail.com',
                            firstName: 'Randy'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });
        });

        describe('compiling failedLogins emails', function() {
            it('should be able to work with selfie users', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    external: true,
                    firstName: 'Randy'
                };
                data.target = 'selfie';
                getHtml('failedLogins', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'failedLogins.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        firstName: 'Randy',
                        link: 'http://localhost:9000/#/pass/reset?selfie=true'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should be able to work with portal users', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    firstName: 'Randy'
                };
                data.target = 'portal';
                getHtml('failedLogins', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'failedLogins.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        firstName: 'Randy',
                        link: 'http://localhost:9000/#/password/reset'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should be able to work with showcase users', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    firstName: 'Randy'
                };
                data.target = 'showcase';
                getHtml('failedLogins', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'failedLogins--app.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        firstName: 'Randy',
                        link: 'http://localhost:9000/#/showcase/pass/reset'
                    });
                    expect();
                }).then(done, done.fail);
            });
        });

        describe('compiling a forgotPassword email', function() {
            beforeEach(function() {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    id: 'u-123',
                    firstName: 'Randy'
                };
                data.token = 'token';
            });

            it('should work for targets that have query params', function(done) {
                data.target = 'selfie';
                getHtml('forgotPassword', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordReset.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        firstName: 'Randy',
                        resetLink: 'http://localhost:9000/#/pass/reset?selfie=true&id=u-123&token=token'
                    });
                }).then(done, done.fail);
            });

            it('should work for targets without query params', function(done) {
                data.target = 'portal';
                getHtml('forgotPassword', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordReset.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        firstName: 'Randy',
                        resetLink: 'http://localhost:9000/#/password/reset?id=u-123&token=token'
                    });
                }).then(done, done.fail);
            });

            it('should work for showcase users', function(done) {
                data.target = 'showcase';
                getHtml('forgotPassword', data, config).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordReset--app.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        firstName: 'Randy',
                        resetLink: 'http://localhost:9000/#/showcase/pass/reset?id=u-123&token=token'
                    });
                }).then(done, done.fail);
            });
        });

        it('should be able to compile campaignActive emails', function(done) {
            data.campaign = { name: 'Amazing Campaign' };
            getHtml('campaignActive', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith('campaignActive.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    campName: 'Amazing Campaign',
                    dashboardLink: 'dashboard link'
                });
            }).then(done, done.fail);
        });

        it('should be able to compile campaignSubmitted emails', function(done) {
            data.campaign = { id: 'c-123', name: 'Amazing Campaign' };
            data.user = { firstName: 'Emma' };
            getHtml('campaignSubmitted', data, config).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith('campaignSubmitted.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    firstName: 'Emma',
                    campName: 'Amazing Campaign',
                    previewLink: 'preview link for campaign c-123'
                });
            }).then(done, done.fail);
        });

        describe('compiling an initializedShowcaseCampaign email', function() {
            beforeEach(function() {
                data.campaign = {
                    id: 'cam-hduiewhdueiwd',
                    advertiserId: 'a-diowhduiwer',
                    externalCampaigns: {
                        beeswax: {
                            externalId: 83473895
                        }
                    }
                };

                requestUtils.makeSignedRequest.and.returnValue(Q.when({
                    response: { statusCode: 200 },
                    body: {
                        id: data.campaign.advertiserId,
                        beeswaxIds: {
                            advertiser: 8542
                        }
                    }
                }));
            });

            it('should compile', function(done) {
                getHtml('initializedShowcaseCampaign', data, config).then(function() {
                    expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith(config.appCreds, 'get', {
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.advertisers.endpoint + '/' + data.campaign.advertiserId),
                        json: true
                    });
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith('initializedShowcaseCampaign.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        beeswaxCampaignId: data.campaign.externalCampaigns.beeswax.externalId,
                        beeswaxCampaignURI: 'http://stingersbx.beeswax.com/advertisers/8542/campaigns/83473895/line_items'
                    });
                }).then(done, done.fail);
            });

            describe('if the request for the advertiser fails', function() {
                beforeEach(function() {
                    requestUtils.makeSignedRequest.and.returnValue(Q.when({
                        response: { statusCode: 404 },
                        body: 'NOT FOUND!'
                    }));
                });

                it('should fail', function(done) {
                    getHtml('initializedShowcaseCampaign', data, config).then(done.fail).catch(function(reason) {
                        expect(reason).toEqual(new Error('Failed to GET advertiser(' + data.campaign.advertiserId + '): [404]: NOT FOUND!'));
                    }).then(done, done.fail);
                });
            });
        });
    });

    describe('getAttachments', function() {
        beforeEach(function() {
            emailFactory.__private__.getAttachments.and.callThrough();
            fs.stat.and.callFake(function(path, callback) {
                callback(null, {
                    isFile: function() {
                        return true;
                    }
                });
            });
        });

        it('should be able to return attachments for selfie emails', function(done) {
            emailFactory.__private__.getAttachments(data).then(function(attachments) {
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname, '../../templates/assets/logo.png'), jasmine.any(Function));
                expect(attachments).toEqual([
                    {
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }
                ]);
                done();
            }).catch(done.fail);
        });

        it('should be able to return attachments for showcase emails', function(done) {
            data.target = 'showcase';
            emailFactory.__private__.getAttachments(data).then(function(attachments) {
                [
                    { filename: 'reelcontent-email-logo-white.png', cid: 'reelContentLogoWhite' },
                    { filename: 'facebook-round-icon.png', cid: 'facebookRoundIcon' },
                    { filename: 'twitter-round-icon.png', cid: 'twitterRoundIcon' },
                    { filename: 'linkedin-round-icon.png', cid: 'linkedinRoundIcon' },
                    { filename: 'website-round-icon.png', cid: 'websiteRoundIcon' }
                ].forEach(function(file) {
                    expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname, '../../templates/assets/' + file.filename), jasmine.any(Function));
                    expect(attachments).toContain({
                        filename: file.filename,
                        cid: file.cid,
                        path: path.join(__dirname, '../../templates/assets/' + file.filename)
                    });
                });
                done();
            }).catch(done.fail);
        });

        it('should warn and ignore any files that cannot be found', function(done) {
            fs.stat.and.callFake(function(path, callback) {
                callback(null, {
                    isFile: function() {
                        return !(/logo/.test(path));
                    }
                });
            });
            emailFactory.__private__.getAttachments(data).then(function(attachments) {
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname, '../../templates/assets/logo.png'), jasmine.any(Function));
                expect(attachments).toEqual([ ]);
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });

        it('should log a warning if there is an error checking if the file exists', function(done) {
            fs.stat.and.callFake(function(path, callback) {
                var error = (/logo/.test(path)) ? 'epic fail' : null;
                callback(error, {
                    isFile: function() {
                        return true;
                    }
                });
            });
            emailFactory.__private__.getAttachments(data).then(function(attachments) {
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname, '../../templates/assets/logo.png'), jasmine.any(Function));
                expect(attachments).toEqual([ ]);
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
    });

    describe('the exported action function', function() {
        it('should reject if there is no "type" option', function(done) {
            email({ data: data, options: options }).then(done.fail).catch(function(error) {
                expect(error).toBeDefined();
                done();
            });
        });

        it('should be able to send an email', function(done) {
            var sendMailSpy = jasmine.createSpy('sendMail()');
            sendMailSpy.and.callFake(function(options, callback) {
                callback(null);
            });
            options.type = 'emailType';
            config.emails = {
                sender: 'sender@gmail.com'
            };
            emailFactory.__private__.getRecipient.and.returnValue(Q.resolve('recipient@gmail.com'));
            emailFactory.__private__.getSubject.and.returnValue('subject');
            emailFactory.__private__.getHtml.and.returnValue(Q.resolve('html body'));
            emailFactory.__private__.getAttachments.and.returnValue(Q.resolve('attachments'));
            htmlToText.fromString.and.returnValue('Yo go here: [HTTP://CINEMA6.COM]\n\n' +
                'Wait no go here: [HTTPS://reelcontent.COM/FOO?TOKEN=ASDF1234]');
            nodemailer.createTransport.and.returnValue({
                sendMail: sendMailSpy
            });
            mockTransport.and.returnValue('transport');
            email({ data: data, options: options }).then(function() {
                expect(emailFactory.__private__.getRecipient).toHaveBeenCalledWith(data, options, config);
                expect(emailFactory.__private__.getSubject).toHaveBeenCalledWith('emailType', data);
                expect(emailFactory.__private__.getHtml).toHaveBeenCalledWith('emailType', data,
                    config);
                expect(emailFactory.__private__.getAttachments).toHaveBeenCalledWith(data);
                expect(mockTransport).toHaveBeenCalled();
                expect(nodemailer.createTransport).toHaveBeenCalledWith('transport');
                expect(sendMailSpy).toHaveBeenCalledWith({
                    from: 'sender@gmail.com',
                    to: 'recipient@gmail.com',
                    subject: 'subject',
                    html: 'html body',
                    text: 'Yo go here: [http://cinema6.com]\n\n' +
                        'Wait no go here: [https://reelcontent.com/foo?token=asdf1234]',
                    attachments: 'attachments'
                }, jasmine.any(Function));
                done();
            }).catch(done.fail);
        });

        it('should reject if getting the recipient fails', function(done) {
            options.type = 'emailType';
            config.emails = {
                sender: 'sender@gmail.com'
            };
            emailFactory.__private__.getRecipient.and.returnValue(Q.reject('epic fail'));
            email({ data: data, options: options }).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });

        it('should reject if getting the html fails', function(done) {
            options.type = 'emailType';
            config.emails = {
                sender: 'sender@gmail.com'
            };
            emailFactory.__private__.getHtml.and.returnValue(Q.reject('epic fail'));
            email({ data: data, options: options }).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });

        it('should reject if getting the attachments fails', function(done) {
            options.type = 'emailType';
            config.emails = {
                sender: 'sender@gmail.com'
            };
            emailFactory.__private__.getAttachments.and.returnValue(Q.reject('epic fail'));
            email({ data: data, options: options }).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });

        it('should reject if sending the email fails', function(done) {
            var sendMailSpy = jasmine.createSpy('sendMail()');
            sendMailSpy.and.callFake(function(options, callback) {
                callback('epic fail');
            });
            options.type = 'emailType';
            config.emails = {
                sender: 'sender@gmail.com'
            };
            emailFactory.__private__.getRecipient.and.returnValue(Q.resolve('recipient@gmail.com'));
            emailFactory.__private__.getSubject.and.returnValue('subject');
            emailFactory.__private__.getHtml.and.returnValue(Q.resolve('html body'));
            emailFactory.__private__.getAttachments.and.returnValue(Q.resolve('attachments'));
            htmlToText.fromString.and.returnValue('Yo go here: [HTTP://CINEMA6.COM]\n\n' +
                'Wait no go here: [HTTPS://reelcontent.COM/FOO?TOKEN=ASDF1234]');
            nodemailer.createTransport.and.returnValue({
                sendMail: sendMailSpy
            });
            mockTransport.and.returnValue('transport');
            email({ data: data, options: options }).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });
    });
});
