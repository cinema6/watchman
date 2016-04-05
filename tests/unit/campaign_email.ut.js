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
        config = { };
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
                data = {};
            });

            describe('and the data has no target', function() {
                it('should be a subject for selfie', function() {
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent Video Ads!');
                });
            });

            describe('and the target is selfie', function() {
                beforeEach(function() {
                    data.target = 'selfie';
                });

                it('should be a subject for selfie', function() {
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent Video Ads!');
                });
            });

            describe('and the target is bob', function() {
                beforeEach(function() {
                    data.target = 'bob';
                });

                it('should be a subject for bob', function() {
                    expect(getSubject(type, data)).toBe('Welcome to Reelcontent Marketing!');
                });
            });
        });

        it('should get the subject for accountWasActivated emails', function() {
            expect(getSubject('accountWasActivated')).toBe('Your Account is Now Active');
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

        it('should return an empty string for an unknown email type', function() {
            expect(getSubject('unknown email type')).toBe('');
        });
    });

    describe('getHtml', function() {
        var getHtml;
        var compileSpy;
        var emailConfig;

        beforeEach(function() {
            emailFactory.__private__.getHtml.and.callThrough();
            getHtml = emailFactory.__private__.getHtml;
            compileSpy = jasmine.createSpy('compileSpy()');
            handlebars.compile.and.returnValue(compileSpy);
            emailFactory.__private__.loadTemplate.and.returnValue(Q.resolve('template'));
            emailConfig = {
                dashboardLink: 'dashboard link',
                manageLink: 'manage link for campaign :campId',
                reviewLink: 'review link for campaign :campId',
                supportAddress: 'support@reelcontent.com',
                passwordResetPages: {
                    portal: 'http://localhost:9000/#/password/reset',
                    selfie: 'http://localhost:9000/#/pass/reset?selfie=true'
                },
                forgotTargets: {
                    portal: 'http://localhost:9000/#/password/reset',
                    selfie: 'http://localhost:9000/#/pass/reset?selfie=true'
                }
            };
        });

        it('should reject for an unknown email type', function(done) {
            getHtml('unknown email type').then(done.fail).catch(function(error) {
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
            getHtml('campaignExpired', data, emailConfig).then(function() {
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
            getHtml('campaignReachedBudget', data, emailConfig).then(function() {
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
            getHtml('campaignApproved', data, emailConfig).then(function() {
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
            getHtml('campaignUpdateApproved', data, emailConfig).then(function() {
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
            getHtml('campaignRejected', data, emailConfig).then(function() {
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
            getHtml('campaignUpdateRejected', data, emailConfig).then(function() {
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
                getHtml('newUpdateRequest', data, emailConfig).then(function() {
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
                getHtml('newUpdateRequest', data, emailConfig).then(function() {
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
                    email: 'foo@test.com'
                };
                data.balance = 9001.9876;
            });

            it('should handle payments from credit cards', function(done) {
                getHtml('paymentMade', data, emailConfig).then(function() {
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
                            last4: '1234'
                        },
                        date: 'Monday, April 04, 2016',
                        balance: '$9001.99'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should handle payments from paypal accounts', function(done) {
                data.payment.method = { type: 'paypal', email: 'johnny@moneybags.com' };

                getHtml('paymentMade', data, emailConfig).then(function() {
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
                        balance: '$9001.99'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });
        });

        describe('compiling an activateAccount email', function() {
            beforeEach(function() {
                emailConfig.activationTargets = {
                    selfie: 'http://link.com',
                    bob: 'http://bob-link.com'
                };
                data.user = {
                    id: 'u-123'
                };
                data.token = 'token';
            });

            it('should handle the possibility of a url without query params', function(done) {
                getHtml('activateAccount', data, emailConfig).then(function() {
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
                emailConfig.activationTargets.selfie = 'http://link.com?query=param';

                getHtml('activateAccount', data, emailConfig).then(function() {
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
                    getHtml('activateAccount', data, emailConfig).then(function() {
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

            describe('if the target is bob', function() {
                beforeEach(function() {
                    data.target = 'bob';
                });

                it('should use the bob template and data', function(done) {
                    getHtml('activateAccount', data, emailConfig).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'activateAccount--bob.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            activationLink: 'http://bob-link.com?id=u-123&token=token'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });
        });

        describe('if the type is "accountWasActivated"', function() {
            var type;

            beforeEach(function() {
                type = 'accountWasActivated';
                emailConfig.dashboardLinks = {
                    selfie: 'dashboard link',
                    bob: 'bob dashboard link'
                };
            });

            describe('without a target', function() {
                it('should use the selfie template and data', function(done) {
                    getHtml('accountWasActivated', data, emailConfig).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'accountWasActivated.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            dashboardLink: 'dashboard link'
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
                    getHtml('accountWasActivated', data, emailConfig).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'accountWasActivated.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            dashboardLink: 'dashboard link'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });

            describe('with a bob target', function() {
                beforeEach(function() {
                    data.target = 'bob';
                });

                it('should use the bob template and data', function(done) {
                    getHtml('accountWasActivated', data, emailConfig).then(function() {
                        expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                            'accountWasActivated--bob.html');
                        expect(handlebars.compile).toHaveBeenCalledWith('template');
                        expect(compileSpy).toHaveBeenCalledWith({
                            dashboardLink: 'bob dashboard link'
                        });
                        expect();
                        done();
                    }).catch(done.fail);
                });
            });
        });

        it('should be able to compile a passwordChanged email', function(done) {
            data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
            getHtml('passwordChanged', data, emailConfig).then(function() {
                expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                    'passwordChanged.html');
                expect(handlebars.compile).toHaveBeenCalledWith('template');
                expect(compileSpy).toHaveBeenCalledWith({
                    contact: 'support@reelcontent.com',
                    date: 'Friday, November 10, 2000',
                    time: jasmine.stringMatching(/\d{2}:\d{2}:\d{2}.+/)
                });
                expect();
                done();
            }).catch(done.fail);
        });

        describe('compiling an emailChanged email', function() {
            it('should be able to compile when sending to the new email address', function(done) {
                data.user = {
                    email: 'new-email@gmail.com'
                };
                data.newEmail = 'new-email@gmail.com';
                data.oldEmail = 'old-email@gmail.com';
                getHtml('emailChanged', data, emailConfig).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'emailChanged.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        newEmail: 'new-email@gmail.com',
                        oldEmail: 'old-email@gmail.com'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should be able to compile when sending to the old email address', function(done) {
                data.user = {
                    email: 'old-email@gmail.com'
                };
                data.newEmail = 'new-email@gmail.com';
                data.oldEmail = 'old-email@gmail.com';
                getHtml('emailChanged', data, emailConfig).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'emailChanged.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        contact: 'support@reelcontent.com',
                        newEmail: 'new-email@gmail.com'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });
        });

        describe('compiling failedLogins emails', function() {
            it('should be able to work with selfie users', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    external: true
                };
                getHtml('failedLogins', data, emailConfig).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'failedLogins.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        link: 'http://localhost:9000/#/pass/reset?selfie=true'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should be able to work with non-selfie users', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com'
                };
                getHtml('failedLogins', data, emailConfig).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'failedLogins.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        link: 'http://localhost:9000/#/password/reset'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });
        });

        describe('compiling a forgotPassword email', function() {
            it('should work for targets that have query params', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    id: 'u-123'
                };
                data.target = 'selfie';
                data.token = 'token';
                getHtml('forgotPassword', data, emailConfig).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordReset.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        resetLink: 'http://localhost:9000/#/pass/reset?selfie=true' +
                            '&id=u-123&token=token'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });

            it('should work for targets without query params', function(done) {
                data.user = {
                    email: 'c6e2etester@gmail.com',
                    id: 'u-123'
                };
                data.target = 'portal';
                data.token = 'token';
                getHtml('forgotPassword', data, emailConfig).then(function() {
                    expect(emailFactory.__private__.loadTemplate).toHaveBeenCalledWith(
                        'passwordReset.html');
                    expect(handlebars.compile).toHaveBeenCalledWith('template');
                    expect(compileSpy).toHaveBeenCalledWith({
                        resetLink: 'http://localhost:9000/#/password/reset?id=u-123&token=token'
                    });
                    expect();
                    done();
                }).catch(done.fail);
            });
        });
    });

    describe('getAttachments', function() {
        var files;

        beforeEach(function() {
            emailFactory.__private__.getAttachments.and.callThrough();
            fs.stat.and.callFake(function(path, callback) {
                callback(null, {
                    isFile: function() {
                        return true;
                    }
                });
            });
            files = [
                { filename: 'pic1.jpg', cid: 'picNumbah1' },
                { filename: 'pic2.png', cid: 'picNumbah2' }
            ];
        });

        it('should be able to return attachments', function(done) {
            emailFactory.__private__.getAttachments(files).then(function(attachments) {
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname,
                    '../../templates/assets/pic1.jpg'), jasmine.any(Function));
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname,
                    '../../templates/assets/pic2.png'), jasmine.any(Function));
                expect(attachments).toEqual([
                    { filename: 'pic1.jpg', cid: 'picNumbah1', path: path.join(__dirname,
                        '../../templates/assets/pic1.jpg') },
                    { filename: 'pic2.png', cid: 'picNumbah2', path: path.join(__dirname,
                        '../../templates/assets/pic2.png') }
                ]);
                done();
            }).catch(done.fail);
        });

        it('should warn and ignore any files that cannot be found', function(done) {
            fs.stat.and.callFake(function(path, callback) {
                callback(null, {
                    isFile: function() {
                        return !(/pic1/.test(path));
                    }
                });
            });
            emailFactory.__private__.getAttachments(files).then(function(attachments) {
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname,
                    '../../templates/assets/pic1.jpg'), jasmine.any(Function));
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname,
                    '../../templates/assets/pic2.png'), jasmine.any(Function));
                expect(attachments).toEqual([
                    { filename: 'pic2.png', cid: 'picNumbah2', path: path.join(__dirname,
                        '../../templates/assets/pic2.png') }
                ]);
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });

        it('should log a warning if there is an error checking if the file exists', function(done) {
            fs.stat.and.callFake(function(path, callback) {
                var error = (/pic1/.test(path)) ? 'epic fail' : null;
                callback(error, {
                    isFile: function() {
                        return true;
                    }
                });
            });
            emailFactory.__private__.getAttachments(files).then(function(attachments) {
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname,
                    '../../templates/assets/pic1.jpg'), jasmine.any(Function));
                expect(fs.stat).toHaveBeenCalledWith(path.join(__dirname,
                    '../../templates/assets/pic2.png'), jasmine.any(Function));
                expect(attachments).toEqual([
                    { filename: 'pic2.png', cid: 'picNumbah2', path: path.join(__dirname,
                        '../../templates/assets/pic2.png') }
                ]);
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
    });

    describe('the exported action function', function() {
        it('should reject if there is no "type" option', function(done) {
            email(data, options).then(done.fail).catch(function(error) {
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
            email(data, options).then(function() {
                expect(emailFactory.__private__.getRecipient).toHaveBeenCalledWith(data, options, config);
                expect(emailFactory.__private__.getSubject).toHaveBeenCalledWith('emailType', data);
                expect(emailFactory.__private__.getHtml).toHaveBeenCalledWith('emailType', data,
                    config.emails);
                expect(emailFactory.__private__.getAttachments).toHaveBeenCalledWith(
                    [{ filename: 'logo.png', cid: 'reelContentLogo' }]);
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
            email(data, options).then(done.fail).catch(function(error) {
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
            email(data, options).then(done.fail).catch(function(error) {
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
            email(data, options).then(done.fail).catch(function(error) {
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
            email(data, options).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });
    });
});
