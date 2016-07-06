'use strict';

const Q = require('q');
const fs = require('fs');
const handlebars = require('handlebars');
const htmlToText = require('html-to-text');
const logger = require('cwrx/lib/logger.js');
const nodemailer = require('nodemailer');
const path = require('path');
const postmark = require('postmark');
const proxyquire = require('proxyquire').noCallThru();
const requestUtils = require('cwrx/lib/requestUtils.js');
const uuid = require('rc-uuid');
const resolveURL = require('url').resolve;

describe('campaign_email.js', function() {
    beforeEach(function() {
        const self = this;
        self.event = {
            data: { campaign: { } },
            options: {
                provider: 'ses'
            }
        };
        self.mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        self.mockSesTransport = jasmine.createSpy('sesTransport()');
        self.mockTransport = {
            sendMail: jasmine.createSpy('sendMail()').and.callFake(function(email, callback) {
                callback(null, null);
            })
        };
        self.CwrxRequest = function() { };
        self.CwrxRequest.prototype = {
            get: jasmine.createSpy('')
        };
        self.emailFactory = proxyquire('../../src/actions/message/campaign_email.js', {
            'nodemailer-ses-transport': self.mockSesTransport,
            '../../../lib/CwrxRequest.js': self.CwrxRequest,
            'cwrx/lib/requestUtils.js': requestUtils
        });
        self.config = {
            emails: {
                manageLink: 'manage link for campaign :campId',
                dashboardLinks: {
                    selfie: 'dashboard link',
                    showcase: 'showcase dashboard link'
                },
                sender: 'e2eSender@fake.com',
                supportAddress: 'e2eSupport@fake.com',
                reviewLink: 'review link for campaign :campId',
                previewLink: 'preview link for campaign :campId',
                activationTargets: {
                    selfie: 'http://link.com',
                    showcase: 'http://showcase-link.com'
                },
                passwordResetPages: {
                    portal: 'http://localhost:9000/#/password/forgot',
                    selfie: 'http://localhost:9000/#/pass/forgot?selfie=true',
                    showcase: 'http://localhost:9000/#/showcase/pass/forgot'
                },
                forgotTargets: {
                    portal: 'http://localhost:9000/#/password/reset',
                    selfie: 'http://localhost:9000/#/pass/reset?selfie=true',
                    showcase: 'http://localhost:9000/#/showcase/pass/reset'
                },
                beeswax: {
                    campaignLink: 'https://www.link.com/{{advertiserId}}/{{campaignId}}'
                }
            },
            cwrx: {
                api: {
                    root: 'https://root',
                    users: {
                        endpoint: '/users'
                    },
                    advertisers: {
                        endpoint: '/advertisers'
                    },
                    analytics: {
                        endpoint: '/analytics'
                    }
                }
            },
            appCreds: 'appCreds',
            postmark: {
                templates: {
                    campaignExpired: 'campaignExpired-template-id',
                    campaignOutOfBudget: 'campaignOutOfBudget-template-id',
                    campaignApproved: 'campaignApproved-template-id',
                    campaignUpdateApproved: 'campaignUpdateApproved-template-id',
                    campaignRejected: 'campaignRejected-template-id',
                    campaignUpdateRejected: 'campaignUpdateRejected-template-id',
                    newUpdateRequest: 'newUpdateRequest-template-id',
                    paymentReceipt: 'paymentReceipt-template-id',
                    'paymentReceipt--app': 'paymentReceipt--app--template-id',
                    activateAccount: 'activateAccount-template-id',
                    'activateAccount--app': 'activateAccount--app-template-id',
                    accountWasActivated: 'accountWasActivated-template-id',
                    'accountWasActivated--app': 'accountWasActivated--app-template-id',
                    passwordChanged: 'passwordChanged-template-id',
                    'passwordChanged--app': 'passwordChanged--app-template-id',
                    emailChanged: 'emailChanged-template-id',
                    'emailChanged--app': 'emailChanged--app-template-id',
                    failedLogins: 'failedLogins-template-id',
                    'failedLogins--app': 'failedLogins--app-template-id',
                    passwordReset: 'passwordReset-template-id',
                    'passwordReset--app': 'passwordReset--app-template-id',
                    chargePaymentPlanFailure: 'chargePaymentPlanFailure-template-id',
                    campaignActive: 'campaignActive-template-id',
                    campaignSubmitted: 'campaignSubmitted-template-id',
                    initializedShowcaseCampaign: 'initializedShowcaseCampaign-template-id',
                    'campaignActive--app': 'campaignActive--app-template-id',
                    'promotionEnded--app': 'promotionEnded--app-template-id',
                    'weekOneStats--app': 'weekOneStats--app-template-id'
                }
            },
            state: {
                secrets: {
                    postmark: {
                        key: 'server key'
                    }
                }
            }
        };
        self.showcaseAttachments = [
            { filename: 'reelcontent-email-logo-white.png', cid: 'reelContentLogoWhite', path: path.join(__dirname, '../../templates/assets/reelcontent-email-logo-white.png') },
            { filename: 'facebook-round-icon.png', cid: 'facebookRoundIcon', path: path.join(__dirname, '../../templates/assets/facebook-round-icon.png')},
            { filename: 'twitter-round-icon.png', cid: 'twitterRoundIcon', path: path.join(__dirname, '../../templates/assets/twitter-round-icon.png') },
            { filename: 'linkedin-round-icon.png', cid: 'linkedinRoundIcon', path: path.join(__dirname, '../../templates/assets/linkedin-round-icon.png') },
            { filename: 'website-round-icon.png', cid: 'websiteRoundIcon', path: path.join(__dirname, '../../templates/assets/website-round-icon.png') }
        ];
        self.showcasePostmarkAttachments = [
            { Name: 'reelcontent-email-logo-white.png', Content: 'abcdef', ContentType: 'image/png', ContentID: 'cid:reelContentLogoWhite' },
            { Name: 'facebook-round-icon.png', Content: 'abcdef', ContentType: 'image/png', ContentID: 'cid:facebookRoundIcon' },
            { Name: 'twitter-round-icon.png', Content: 'abcdef', ContentType: 'image/png', ContentID: 'cid:twitterRoundIcon' },
            { Name: 'linkedin-round-icon.png', Content: 'abcdef', ContentType: 'image/png', ContentID: 'cid:linkedinRoundIcon' },
            { Name: 'website-round-icon.png', Content: 'abcdef', ContentType: 'image/png', ContentID: 'cid:websiteRoundIcon' }
        ];
        self.email = self.emailFactory(self.config);
        self.mockTemplate = jasmine.createSpy('mockTemplate()').and.returnValue('compiled template');
        spyOn(postmark.Client.prototype, 'sendEmailWithTemplate').and.callFake(function(body, callback) {
            callback(null, { });
        });
        spyOn(fs, 'readFile').and.callFake(function(path, options, callback) {
            if(/assets/.test(path)) {
                callback(null, 'abcdef');
            } else {
                callback(null, 'template content');
            }
        });
        spyOn(fs, 'stat').and.callFake(function(path, callback) {
            callback(null, {
                isFile: jasmine.createSpy('isFile()').and.returnValue(true)
            });
        });
        spyOn(handlebars, 'compile').and.callFake(function(template) {
            return [
                'somedude@fake.com'
            ].indexOf(template) === -1 ? self.mockTemplate : function() {
                return template;
            };
        });
        spyOn(htmlToText, 'fromString').and.returnValue('text');
        spyOn(requestUtils, 'makeSignedRequest').and.returnValue(Promise.resolve());
        spyOn(logger, 'getLog').and.returnValue(self.mockLog);
        spyOn(nodemailer, 'createTransport').and.returnValue(self.mockTransport);
        //spyOn(self.CwrxRequest.prototype, 'get');
    });

    describe('the exported function', function() {
        it('should be an action factory', function() {
            expect(this.emailFactory).toEqual(jasmine.any(Function));
            expect(this.emailFactory.name).toBe('factory');
        });

        it('should be able to construct an action function', function() {
            expect(this.email).toEqual(jasmine.any(Function));
            expect(this.email.name).toBe('');
        });

        it('should create the postmark client', function() {
            spyOn(postmark, 'Client').and.callThrough();
            this.emailFactory(this.config);
            expect(postmark.Client).toHaveBeenCalledWith('server key');
        });
    });

    describe('action options', function() {
        beforeEach(function() {
            this.event.options.to = 'somedude@fake.com';
        });

        it('should reject if not given an email type', function(done) {
            this.email(this.event).then(done.fail).catch(function(error) {
                expect(error).toBe('Must specify a valid email type');
            }).then(done, done.fail);
        });

        it('should reject if given an unknown email type', function(done) {
            this.event.options.type = 'fakeEmailType';
            this.email(this.event).then(done.fail).catch(function(error) {
                expect(error).toBe('Must specify a valid email type');
            }).then(done, done.fail);
        });
    });

    describe('getting the recipient of an email', function() {
        beforeEach(function() {
            this.event.options.type = 'campaignExpired';
        });

        describe('when the "toSupport" option is true', function() {
            beforeEach(function(done) {
                this.event.options.toSupport = true;
                this.email(this.event).then(done, done.fail);
            });

            it('should email the support address', function() {
                expect(this.mockTransport.sendMail.calls.mostRecent().args[0].to).toBe('e2eSupport@fake.com');
            });
        });

        describe('when the "to" option is specified', function() {
            beforeEach(function() {
                handlebars.compile.and.callThrough();
            });

            it('should email the specified email', function(done) {
                const self = this;
                self.event.options.to = 'somedude@fake.com';
                self.email(self.event).then(function() {
                    expect(self.mockTransport.sendMail.calls.mostRecent().args[0].to).toBe('somedude@fake.com');
                }).then(done, done.fail);
            });

            it('should be able to compile the field with data', function(done) {
                const self = this;
                self.event.options.to = '{{oldEmail}}';
                self.event.data.oldEmail = 'somedude@fake.com';
                self.email(self.event).then(function() {
                    expect(self.mockTransport.sendMail.calls.mostRecent().args[0].to).toBe('somedude@fake.com');
                }).then(done, done.fail);
            });
        });

        describe('when there exists a user on the data object', function() {
            beforeEach(function(done) {
                this.event.data.user = {
                    email: 'userEmail@fake.com'
                };
                this.email(this.event).then(done, done.fail);
            });

            it('should email the email on the user', function() {
                expect(this.mockTransport.sendMail.calls.mostRecent().args[0].to).toBe('userEmail@fake.com');
            });
        });

        describe('when there is a campaign on the data object', function() {
            beforeEach(function() {
                this.event.data.campaign = {
                    user: 'u-123'
                };
            });

            describe('the request for the user', function() {
                it('should be made correctly', function(done) {
                    this.email(this.event).then(done.fail, () => {
                        expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('appCreds', 'get', {
                            fields: 'email,firstName',
                            json: true,
                            url: 'https://root/users/u-123'
                        });
                    }).then(done, done.fail);
                });

                describe('when it responds with a 200', function() {
                    beforeEach(function(done) {
                        requestUtils.makeSignedRequest.and.returnValue(Promise.resolve({
                            response: {
                                statusCode: 200
                            },
                            body: {
                                email: 'somedude@fake.com',
                                firstName: 'Bob'
                            }
                        }));
                        this.email(this.event).then(done, done.fail);
                    });

                    it('should email the user of the campaign', function() {
                        expect(this.mockTransport.sendMail.calls.mostRecent().args[0].to).toBe('somedude@fake.com');
                    });

                    it('should add the requested user to the data object', function() {
                        expect(this.event.data.user).toEqual({
                            email: 'somedude@fake.com',
                            firstName: 'Bob'
                        });
                    });
                });

                describe('when it does not respond with a 200', function() {
                    beforeEach(function(done) {
                        requestUtils.makeSignedRequest.and.returnValue(Promise.resolve({
                            response: {
                                statusCode: 500
                            },
                            body: 'epic fail'
                        }));
                        this.email(this.event).then(done.fail, done);
                    });

                    it('should log a warning and not send the email', function() {
                        expect(this.mockLog.warn).toHaveBeenCalled();
                        expect(this.mockTransport.sendMail).not.toHaveBeenCalled();
                    });
                });

                describe('when it fails', function() {
                    beforeEach(function() {
                        requestUtils.makeSignedRequest.and.returnValue(Promise.reject('epic fail'));
                    });

                    it('should reject and not send the email', function(done) {
                        const self = this;
                        self.email(self.event).then(done.fail).catch(function(error) {
                            expect(error).toBe('epic fail');
                            expect(self.mockTransport.sendMail).not.toHaveBeenCalled();
                        }).then(done, done.fail);
                    });
                });
            });
        });

        describe('when there is an org in the data', function() {
            beforeEach(function(done) {
                this.event.data.org = {
                    id: 'o-' + uuid.createUuid()
                };

                this.success = jasmine.createSpy('success()');
                this.failure = jasmine.createSpy('failure()');

                requestUtils.makeSignedRequest.and.returnValue((this.getUsersDeferred = Q.defer()).promise);
                requestUtils.makeSignedRequest.calls.reset();

                this.email(this.event).then(this.success, this.failure);
                setTimeout(done);
            });

            it('should make a request for the org\'s users', function() {
                expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith(this.config.appCreds, 'get', {
                    url: resolveURL(this.config.cwrx.api.root, this.config.cwrx.api.users.endpoint),
                    qs: { org: this.event.data.org.id, fields: 'email,firstName', sort: 'created,1' }
                });
            });

            describe('if the request fails', function() {
                beforeEach(function(done) {
                    this.reason = new Error('Something bad happened.');
                    this.getUsersDeferred.reject(this.reason);
                    setTimeout(done);
                });

                it('should reject the Promise', function() {
                    expect(this.failure).toHaveBeenCalledWith(this.reason);
                });
            });

            describe('if the request succeeds', function() {
                describe('with a failing status code', function() {
                    beforeEach(function(done) {
                        this.body = 'INTERNAL ERROR';
                        this.response = { statusCode: 500 };
                        this.result = { response: this.response, body: this.body };

                        this.getUsersDeferred.fulfill(this.result);
                        setTimeout(done);
                    });

                    it('should reject the Promise', function() {
                        expect(this.failure).toHaveBeenCalledWith(new Error('Failed to get users for org ' + this.event.data.org.id + ': ' + this.body));
                    });
                });

                describe('with a 200', function() {
                    beforeEach(function(done) {
                        this.body = [{ id: 'u-' + uuid.createUuid(), email: 'some.shmuck@reelcontent.com' }];
                        this.response = { statusCode: 200 };
                        this.result = { response: this.response, body: this.body };

                        this.getUsersDeferred.fulfill(this.result);
                        setTimeout(done);
                    });

                    it('should send to the first user\'s email', function() {
                        expect(this.mockTransport.sendMail.calls.mostRecent().args[0].to).toBe(this.body[0].email);
                    });
                });
            });
        });

        describe('when there is no way to get a recipient', function() {
            it('should reject with an error', function(done) {
                this.email(this.event).then(done.fail).catch(function(error) {
                    expect(error).toBe('Could not find a recipient');
                }).then(done, done.fail);
            });
        });
    });

    describe('sending an email with ses', function() {
        it('should reject if reading the template file fails', function(done) {
            this.event.options.type = 'campaignExpired';
            this.event.options.to = 'somedude@fake.com';
            fs.readFile.and.callFake(function(path, options, callback) {
                callback('epic fail');
            });
            this.email(this.event).then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
            }).then(done, done.fail);
        });

        it('should compile the email template', function(done) {
            const self = this;
            self.event.options.type = 'campaignExpired';
            self.event.options.to = 'somedude@fake.com';
            fs.readFile.and.callFake(function(path, options, callback) {
                callback(null, 'template content');
            });
            self.compiledTemplate = jasmine.createSpy('compiledTemplate()');
            handlebars.compile.and.returnValue(self.compiledTemplate);
            self.email(self.event).then(function() {
                expect(handlebars.compile).toHaveBeenCalledWith('template content');
                expect(self.compiledTemplate).toHaveBeenCalled();
            }).then(done, done.fail);
        });

        it('should lowercase links for the email text', function(done) {
            const self = this;
            const template = 'template content [HTTPS://WWW.ANGRY-MAD-LINK-RAWR.COM]';
            self.event.options.type = 'campaignExpired';
            self.event.options.to = 'somedude@fake.com';
            fs.readFile.and.callFake(function(path, options, callback) {
                callback(null, template);
            });
            htmlToText.fromString.and.callFake(function(html) {
                return html;
            });
            self.compiledTemplate = jasmine.createSpy('compiledTemplate()').and.returnValue(template);
            handlebars.compile.and.returnValue(self.compiledTemplate);
            self.email(self.event).then(function() {
                expect(self.mockTransport.sendMail.calls.mostRecent().args[0].text).toBe('template content [https://www.angry-mad-link-rawr.com]');
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignExpired email', function() {
        beforeEach(function() {
            this.event.data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            this.event.data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
            this.event.options.type = 'campaignExpired';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignExpired.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    date: 'Friday, November 10, 2000',
                    dashboardLink: 'dashboard link',
                    manageLink: 'manage link for campaign c-123'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Your Campaign Has Ended',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignExpired-template-id',
                    TemplateModel: {
                        campName: 'Nombre',
                        date: 'Friday, November 10, 2000',
                        dashboardLink: 'dashboard link',
                        manageLink: 'manage link for campaign c-123'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignExpired',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignReachedBudget email', function() {
        beforeEach(function() {
            this.event.data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            this.event.data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
            this.event.options.type = 'campaignReachedBudget';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignOutOfBudget.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    date: 'Friday, November 10, 2000',
                    dashboardLink: 'dashboard link',
                    manageLink: 'manage link for campaign c-123'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Your Campaign is Out of Budget',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignOutOfBudget-template-id',
                    TemplateModel: {
                        campName: 'Nombre',
                        date: 'Friday, November 10, 2000',
                        dashboardLink: 'dashboard link',
                        manageLink: 'manage link for campaign c-123'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignOutOfBudget',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignApproved email', function() {
        beforeEach(function() {
            this.event.data.campaign = {
                name: 'Nombre'
            };
            this.event.options.type = 'campaignApproved';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignApproved.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent Campaign Approved',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignApproved-template-id',
                    TemplateModel: {
                        campName: 'Nombre',
                        dashboardLink: 'dashboard link'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignApproved',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignUpdateApproved email', function() {
        beforeEach(function() {
            this.event.data.campaign = {
                name: 'Nombre'
            };
            this.event.options.type = 'campaignUpdateApproved';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignUpdateApproved.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Your Campaign Change Request Has Been Approved',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignUpdateApproved-template-id',
                    TemplateModel: {
                        campName: 'Nombre',
                        dashboardLink: 'dashboard link'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignUpdateApproved',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignRejected email', function() {
        beforeEach(function() {
            this.event.data.campaign = {
                name: 'Nombre'
            };
            this.event.data.updateRequest = {
                rejectionReason: 'rejected'
            };
            this.event.options.type = 'campaignRejected';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignRejected.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link',
                    rejectionReason: 'rejected'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent Campaign Rejected',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send a using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignRejected-template-id',
                    TemplateModel: {
                        campName: 'Nombre',
                        dashboardLink: 'dashboard link',
                        rejectionReason: 'rejected'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignRejected',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignUpdateRejected email', function() {
        beforeEach(function() {
            this.event.data.campaign = {
                name: 'Nombre'
            };
            this.event.data.updateRequest = {
                rejectionReason: 'rejected'
            };
            this.event.options.type = 'campaignUpdateRejected';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignUpdateRejected.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Nombre',
                    dashboardLink: 'dashboard link',
                    rejectionReason: 'rejected'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Your Campaign Change Request Has Been Rejected',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignUpdateRejected-template-id',
                    TemplateModel: {
                        campName: 'Nombre',
                        dashboardLink: 'dashboard link',
                        rejectionReason: 'rejected'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignUpdateRejected',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a newUpdateRequest email', function() {
        beforeEach(function() {
            this.event.options.type = 'newUpdateRequest';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to use the email of the user', function(done) {
            const self = this;
            self.event.data.user = {
                email: 'email@gmail.com'
            };
            self.event.data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/newUpdateRequest.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    requester: 'email@gmail.com',
                    campName: 'Nombre',
                    reviewLink: 'review link for campaign c-123',
                    user: self.event.data.user,
                    application: self.event.data.application
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: jasmine.any(String),
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to use the application key', function(done) {
            const self = this;
            self.event.data.application = {
                key: 'app-key'
            };
            self.event.data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/newUpdateRequest.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    requester: 'app-key',
                    campName: 'Nombre',
                    reviewLink: 'review link for campaign c-123',
                    user: self.event.data.user,
                    application: self.event.data.application
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: jasmine.any(String),
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        describe('the email subject', function() {
            it('should be able to use the company of the user', function(done) {
                const self = this;
                self.event.data.campaign = {
                    name: 'Nombre'
                };
                self.event.data.user = {
                    company: 'Evil Corp'
                };
                self.email(self.event).then(function() {
                    const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                    expect(subject).toBe('New update request from Evil Corp for campaign "Nombre"');
                }).then(done, done.fail);
            });

            it('should be able to use the name of the user', function(done) {
                const self = this;
                self.event.data.campaign = {
                    name: 'Nombre'
                };
                self.event.data.user = {
                    firstName: 'Patrick',
                    lastName: 'Star'
                };
                self.email(self.event).then(function() {
                    const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                    expect(subject).toBe('New update request from Patrick Star for campaign "Nombre"');
                }).then(done, done.fail);
            });

            it('should be able to use the key of an application', function(done) {
                const self = this;
                self.event.data.campaign = {
                    name: 'Nombre'
                };
                self.event.data.application = {
                    key: 'app-key'
                };
                self.email(self.event).then(function() {
                    const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                    expect(subject).toBe('New update request from app-key for campaign "Nombre"');
                }).then(done, done.fail);
            });
        });

        it('should be able to send using postmark', function(done) {
            const self = this;
            self.event.data.user = {
                email: 'email@gmail.com'
            };
            self.event.data.campaign = {
                id: 'c-123',
                name: 'Nombre'
            };
            self.event.data.application = {
                key: 'app-key'
            };
            self.event.options.provider = 'postmark';
            self.email(self.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'newUpdateRequest-template-id',
                    TemplateModel: {
                        requester: 'email@gmail.com',
                        campName: 'Nombre',
                        reviewLink: 'review link for campaign c-123',
                        user: self.event.data.user,
                        application: self.event.data.application
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'newUpdateRequest',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a paymentMade email', function() {
        beforeEach(function() {
            this.event.data.payment = {
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
            this.event.data.user = {
                id: 'u-1',
                email: 'somedude@fake.com',
                firstName: 'Randy'
            };
            this.event.data.balance = 9001.9876;
            this.event.options.type = 'paymentMade';
        });

        describe('selfie payment receipts', function() {
            beforeEach(function() {
                this.event.data.target = 'selfie';
            });

            it('should handle payments from credit cards', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/paymentReceipt.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
                        amount: '$666.66',
                        isCreditCard: true,
                        method: {
                            type: 'creditCard',
                            cardType: 'Visa',
                            cardholderName: 'Johnny Testmonkey',
                            last4: '1234'
                        },
                        date: 'Monday, April 04, 2016',
                        billingEndDate: 'Tuesday, May 03, 2016',
                        balance: '$9001.99',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your payment has been approved',
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });

            it('should handle payments from paypal accounts', function(done) {
                const self = this;
                self.event.data.payment.method = { type: 'paypal', email: 'johnny@moneybags.com' };
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/paymentReceipt.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
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
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your payment has been approved',
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('showcase payment receipts', function() {
            beforeEach(function() {
                this.event.data.target = 'showcase';
            });

            it('should handle payments from credit cards', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/paymentReceipt--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
                        amount: '$666.66',
                        isCreditCard: true,
                        method: {
                            type: 'creditCard',
                            cardType: 'Visa',
                            cardholderName: 'Johnny Testmonkey',
                            last4: '1234'
                        },
                        date: 'Monday, April 04, 2016',
                        billingEndDate: 'Tuesday, May 03, 2016',
                        balance: '$9001.99',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your payment has been approved',
                        html: 'compiled template',
                        text: 'text',
                        attachments: self.showcaseAttachments
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });

            it('should handle payments from paypal accounts', function(done) {
                const self = this;
                self.event.data.payment.method = { type: 'paypal', email: 'johnny@moneybags.com' };
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/paymentReceipt--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
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
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your payment has been approved',
                        html: 'compiled template',
                        text: 'text',
                        attachments: self.showcaseAttachments
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        it('should be able to send using postmark', function(done) {
            this.event.data.target = 'selfie';
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'paymentReceipt-template-id',
                    TemplateModel: {
                        contact: 'e2eSupport@fake.com',
                        amount: '$666.66',
                        isCreditCard: true,
                        method: {
                            type: 'creditCard',
                            cardType: 'Visa',
                            cardholderName: 'Johnny Testmonkey',
                            last4: '1234'
                        },
                        date: 'Monday, April 04, 2016',
                        billingEndDate: 'Tuesday, May 03, 2016',
                        balance: '$9001.99',
                        firstName: 'Randy'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'paymentReceipt',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending an activateAccount email', function() {
        beforeEach(function() {
            this.event.data.user = {
                id: 'u-123',
                firstName: 'Emma',
                email: 'somedude@fake.com'
            };
            this.event.data.token = 'token';
            this.event.options.type = 'activateAccount';
        });

        it('should handle the possibility of a url without query params', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/activateAccount.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    activationLink: 'http://link.com?id=u-123&token=token',
                    firstName: 'Emma'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: jasmine.any(String),
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should handle the possibility of a url with query params', function(done) {
            const self = this;
            self.config.emails.activationTargets.selfie = 'http://link.com?query=param';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/activateAccount.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    activationLink: 'http://link.com?query=param&id=u-123&token=token',
                    firstName: 'Emma'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: jasmine.any(String),
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        describe('if the target is selfie', function() {
            beforeEach(function() {
                this.event.data.target = 'selfie';
            });

            it('should use the selfie template and data', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/activateAccount.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        activationLink: 'http://link.com?id=u-123&token=token',
                        firstName: 'Emma'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: jasmine.any(String),
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('if the target is showcase', function() {
            beforeEach(function() {
                this.event.data.target = 'showcase';
            });

            it('should use the showcase template and data', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/activateAccount--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        activationLink: 'http://showcase-link.com?id=u-123&token=token',
                        firstName: 'Emma'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: jasmine.any(String),
                        html: 'compiled template',
                        text: 'text',
                        attachments: self.showcaseAttachments
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('the email subject', function() {
            describe('and the data has no target', function() {
                it('should be a subject for selfie', function(done) {
                    const self = this;
                    self.email(self.event).then(function() {
                        const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                        expect(subject).toBe('Emma, Welcome to Reelcontent');
                    }).then(done, done.fail);
                });

                it('should be a different subject if the user has no first name', function(done) {
                    const self = this;
                    delete self.event.data.user.firstName;
                    self.email(self.event).then(function() {
                        const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                        expect(subject).toBe('Welcome to Reelcontent');
                    }).then(done, done.fail);
                });
            });

            describe('and the target is selfie', function() {
                beforeEach(function() {
                    this.event.data.target = 'selfie';
                });

                it('should be a subject for selfie', function(done) {
                    const self = this;
                    self.email(self.event).then(function() {
                        const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                        expect(subject).toBe('Emma, Welcome to Reelcontent');
                    }).then(done, done.fail);
                });

                it('should be a different subject if the user has no first name', function(done) {
                    const self = this;
                    delete self.event.data.user.firstName;
                    self.email(self.event).then(function() {
                        const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                        expect(subject).toBe('Welcome to Reelcontent');
                    }).then(done, done.fail);
                });
            });

            describe('and the target is showcase', function() {
                beforeEach(function() {
                    this.event.data.target = 'showcase';
                });

                it('should be a subject for selfie', function(done) {
                    const self = this;
                    self.email(self.event).then(function() {
                        const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                        expect(subject).toBe('Emma, Welcome to Reelcontent Apps');
                    }).then(done, done.fail);
                });

                it('should be a different subject if the user has no first name', function(done) {
                    const self = this;
                    delete self.event.data.user.firstName;
                    self.email(self.event).then(function() {
                        const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                        expect(subject).toBe('Welcome to Reelcontent Apps');
                    }).then(done, done.fail);
                });
            });
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'activateAccount-template-id',
                    TemplateModel: {
                        activationLink: 'http://link.com?id=u-123&token=token',
                        firstName: 'Emma'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'activateAccount',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a chargePaymentPlanFailure email', function() {
        beforeEach(function() {
            this.event.data.org = {
                id: 'o-' + uuid.createUuid()
            };
            this.event.data.paymentPlan = {
                price: 49.99
            };
            this.event.data.paymentMethod = {
                type: 'creditCard',
                cardType: 'MasterCard',
                last4: '6738',
                email: 'a.user@gmail.com'
            };
            this.event.options.type = 'chargePaymentPlanFailure';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/chargePaymentPlanFailure.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    contact: self.config.emails.supportAddress,
                    amount: '$' + self.event.data.paymentPlan.price.toString(),
                    cardType: self.event.data.paymentMethod.cardType,
                    cardLast4: self.event.data.paymentMethod.last4,
                    paypalEmail: self.event.data.paymentMethod.email
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'We Hit a Snag',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            const self = this;
            self.event.options.provider = 'postmark';
            self.email(self.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'chargePaymentPlanFailure-template-id',
                    TemplateModel: {
                        contact: self.config.emails.supportAddress,
                        amount: '$' + self.event.data.paymentPlan.price.toString(),
                        cardType: self.event.data.paymentMethod.cardType,
                        cardLast4: self.event.data.paymentMethod.last4,
                        paypalEmail: self.event.data.paymentMethod.email
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'chargePaymentPlanFailure',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending an accountWasActivated email', function() {
        beforeEach(function() {
            this.event.data.user = {
                firstName: 'Randy',
                email: 'somedude@fake.com'
            };
            this.event.options.type = 'accountWasActivated';
        });

        describe('without a target', function() {
            it('should use the selfie template and data', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/accountWasActivated.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        dashboardLink: 'dashboard link',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: jasmine.any(String),
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('with a selfie target', function() {
            beforeEach(function() {
                this.event.data.target = 'selfie';
            });

            it('should use the selfie template and data', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/accountWasActivated.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        dashboardLink: 'dashboard link',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: jasmine.any(String),
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('with a showcase target', function() {
            beforeEach(function() {
                this.event.data.target = 'showcase';
            });

            it('should use the showcase template and data', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/accountWasActivated--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        dashboardLink: 'showcase dashboard link',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'somedude@fake.com',
                        from: 'e2eSender@fake.com',
                        subject: jasmine.any(String),
                        html: 'compiled template',
                        text: 'text',
                        attachments: self.showcaseAttachments
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('the email subject', function() {
            it('should include the user\'s name if it exists', function(done) {
                const self = this;
                self.email(self.event).then(function() {
                    const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                    expect(subject).toBe('Randy, Your Reelcontent Account Is Ready To Go');
                }).then(done, done.fail);
            });

            it('should not include a name if one does not exist on the user', function(done) {
                const self = this;
                delete self.event.data.user.firstName;
                self.email(self.event).then(function() {
                    const subject = self.mockTransport.sendMail.calls.mostRecent().args[0].subject;
                    expect(subject).toBe('Your Reelcontent Account Is Ready To Go');
                }).then(done, done.fail);
            });
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'accountWasActivated-template-id',
                    TemplateModel: {
                        dashboardLink: 'dashboard link',
                        firstName: 'Randy'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'accountWasActivated',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a passwordChanged email', function() {
        beforeEach(function() {
            this.event.data.date = 'Fri Nov 10 2000 00:00:00 GMT-0500 (EST)';
            this.event.data.user = {
                firstName: 'Randy',
                email: 'somedude@fake.com'
            };
            this.event.options.type = 'passwordChanged';
        });

        it('should work for selfie users', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/passwordChanged.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    contact: 'e2eSupport@fake.com',
                    date: 'Friday, November 10, 2000',
                    time: jasmine.stringMatching(/\d{2}:\d{2}:\d{2}.+/),
                    firstName: 'Randy',
                    dashboardLink: 'dashboard link'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent Password Change Notice',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should work for showcase users', function(done) {
            const self = this;
            self.event.data.target = 'showcase';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/passwordChanged--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    contact: 'e2eSupport@fake.com',
                    date: 'Friday, November 10, 2000',
                    time: jasmine.stringMatching(/\d{2}:\d{2}:\d{2}.+/),
                    firstName: 'Randy',
                    dashboardLink: 'showcase dashboard link'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent Password Change Notice',
                    html: 'compiled template',
                    text: 'text',
                    attachments: self.showcaseAttachments
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'passwordChanged-template-id',
                    TemplateModel: {
                        contact: 'e2eSupport@fake.com',
                        date: 'Friday, November 10, 2000',
                        time: jasmine.stringMatching(/\d{2}:\d{2}:\d{2}.+/),
                        firstName: 'Randy',
                        dashboardLink: 'dashboard link'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'passwordChanged',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending an emailChanged email', function() {
        beforeEach(function() {
            this.event.options.type = 'emailChanged';
            this.event.data.newEmail = 'new-email@gmail.com';
            this.event.data.oldEmail = 'old-email@gmail.com';
        });

        describe('for selfie campaigns', function() {
            it('should be able to compile when sending to the new email address', function(done) {
                const self = this;
                self.event.data.user = {
                    email: 'new-email@gmail.com',
                    firstName: 'Randy'
                };
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/emailChanged.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
                        newEmail: 'new-email@gmail.com',
                        oldEmail: 'old-email@gmail.com',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'new-email@gmail.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your Email Has Been Changed',
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });

            it('should be able to compile when sending to the old email address', function(done) {
                const self = this;
                self.event.data.user = {
                    email: 'old-email@gmail.com',
                    firstName: 'Randy'
                };
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/emailChanged.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
                        newEmail: 'new-email@gmail.com',
                        oldEmail: 'old-email@gmail.com',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'old-email@gmail.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your Email Has Been Changed',
                        html: 'compiled template',
                        text: 'text',
                        attachments: [{
                            filename: 'logo.png',
                            cid: 'reelContentLogo',
                            path: path.join(__dirname, '../../templates/assets/logo.png')
                        }]
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        describe('for showcase campaigns', function() {
            beforeEach(function() {
                this.event.data.target = 'showcase';
            });

            it('should be able to compile when sending to the new email address', function(done) {
                const self = this;
                self.event.data.user = {
                    email: 'new-email@gmail.com',
                    firstName: 'Randy'
                };
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/emailChanged--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
                        newEmail: 'new-email@gmail.com',
                        oldEmail: 'old-email@gmail.com',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'new-email@gmail.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your Email Has Been Changed',
                        html: 'compiled template',
                        text: 'text',
                        attachments: self.showcaseAttachments
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });

            it('should be able to compile when sending to the old email address', function(done) {
                const self = this;
                self.event.data.user = {
                    email: 'old-email@gmail.com',
                    firstName: 'Randy'
                };
                self.email(self.event).then(function() {
                    expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/emailChanged--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                    expect(self.mockTemplate).toHaveBeenCalledWith({
                        contact: 'e2eSupport@fake.com',
                        newEmail: 'new-email@gmail.com',
                        oldEmail: 'old-email@gmail.com',
                        firstName: 'Randy'
                    });
                    expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                        to: 'old-email@gmail.com',
                        from: 'e2eSender@fake.com',
                        subject: 'Your Email Has Been Changed',
                        html: 'compiled template',
                        text: 'text',
                        attachments: self.showcaseAttachments
                    }, jasmine.any(Function));
                }).then(done, done.fail);
            });
        });

        it('should be able to send using postmark', function(done) {
            this.event.data.user = {
                email: 'new-email@gmail.com',
                firstName: 'Randy'
            };
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'emailChanged-template-id',
                    TemplateModel: {
                        contact: 'e2eSupport@fake.com',
                        newEmail: 'new-email@gmail.com',
                        oldEmail: 'old-email@gmail.com',
                        firstName: 'Randy'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'new-email@gmail.com',
                    Tag: 'emailChanged',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a failedLogins email', function() {
        beforeEach(function() {
            this.event.options.type = 'failedLogins';
            this.event.data.user = {
                email: 'somedude@fake.com',
                firstName: 'Randy'
            };
        });

        it('should be able to work with selfie users', function(done) {
            const self = this;
            self.event.data.user.external = true;
            self.event.data.target = 'selfie';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/failedLogins.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    contact: 'e2eSupport@fake.com',
                    firstName: 'Randy',
                    link: 'http://localhost:9000/#/pass/forgot?selfie=true'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent: Multiple-Failed Logins',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to work with portal users', function(done) {
            const self = this;
            self.event.data.target = 'portal';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/failedLogins.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    contact: 'e2eSupport@fake.com',
                    firstName: 'Randy',
                    link: 'http://localhost:9000/#/password/forgot'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent: Multiple-Failed Logins',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to work with showcase users', function(done) {
            const self = this;
            self.event.data.target = 'showcase';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/failedLogins--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    contact: 'e2eSupport@fake.com',
                    firstName: 'Randy',
                    link: 'http://localhost:9000/#/showcase/pass/forgot'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Reelcontent: Multiple-Failed Logins',
                    html: 'compiled template',
                    text: 'text',
                    attachments: self.showcaseAttachments
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.data.user.external = true;
            this.event.data.target = 'selfie';
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'failedLogins-template-id',
                    TemplateModel: {
                        contact: 'e2eSupport@fake.com',
                        firstName: 'Randy',
                        link: 'http://localhost:9000/#/pass/forgot?selfie=true'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'failedLogins',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a forgotPassword email', function() {
        beforeEach(function() {
            this.event.data.user = {
                email: 'somedude@fake.com',
                id: 'u-123',
                firstName: 'Randy'
            };
            this.event.data.token = 'token';
            this.event.options.type = 'forgotPassword';
        });

        it('should work for targets that have query params', function(done) {
            const self = this;
            self.event.data.target = 'selfie';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/passwordReset.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    firstName: 'Randy',
                    resetLink: 'http://localhost:9000/#/pass/reset?selfie=true&id=u-123&token=token'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Forgot Your Password?',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should work for targets without query params', function(done) {
            const self = this;
            self.event.data.target = 'portal';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/passwordReset.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    firstName: 'Randy',
                    resetLink: 'http://localhost:9000/#/password/reset?id=u-123&token=token'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Forgot Your Password?',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should work for showcase users', function(done) {
            const self = this;
            self.event.data.target = 'showcase';
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/passwordReset--app.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    firstName: 'Randy',
                    resetLink: 'http://localhost:9000/#/showcase/pass/reset?id=u-123&token=token'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Forgot Your Password?',
                    html: 'compiled template',
                    text: 'text',
                    attachments: self.showcaseAttachments
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.data.target = 'selfie';
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'passwordReset-template-id',
                    TemplateModel: {
                        firstName: 'Randy',
                        resetLink: 'http://localhost:9000/#/pass/reset?selfie=true&id=u-123&token=token'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'passwordReset',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending a campaignActive email', function() {
        beforeEach(function() {
            this.event.data.campaign = { name: 'Amazing Campaign' };
            this.event.data.user = { firstName: 'Bob' };
            this.event.options.type = 'campaignActive';
            this.event.options.to = 'somedude@fake.com';
        });

        it('should be able to send using ses to selfie targets', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignActive.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    campName: 'Amazing Campaign',
                    dashboardLink: 'dashboard link',
                    firstName: 'Bob'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'Amazing Campaign Is Now Live!',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark to selfie targets', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignActive-template-id',
                    TemplateModel: {
                        campName: 'Amazing Campaign',
                        dashboardLink: 'dashboard link',
                        firstName: 'Bob'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignActive',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send to showcase targets', function(done) {
            const self = this;
            this.event.options.provider = 'postmark';
            this.event.data.target = 'showcase';
            this.event.data.campaign.application = 'showcase';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignActive--app-template-id',
                    TemplateModel: {
                        campName: 'Amazing Campaign',
                        dashboardLink: 'showcase dashboard link',
                        firstName: 'Bob'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignActive--app',
                    TrackOpens: true,
                    Attachments: self.showcasePostmarkAttachments.concat({
                        Name: 'plant-success.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:plantSuccess'
                    })
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending campaignSubmitted emails', function() {
        beforeEach(function() {
            this.event.data.campaign = { id: 'c-123', name: 'Amazing Campaign' };
            this.event.data.user = {
                firstName: 'Emma',
                email: 'somedude@fake.com'
            };
            this.event.options.type = 'campaignSubmitted';
        });

        it('should be able to send using ses', function(done) {
            const self = this;
            self.email(self.event).then(function() {
                expect(fs.readFile).toHaveBeenCalledWith(path.join(__dirname, '../../templates/campaignSubmitted.html'), { encoding: 'utf8' }, jasmine.any(Function));
                expect(self.mockTemplate).toHaveBeenCalledWith({
                    firstName: 'Emma',
                    campName: 'Amazing Campaign',
                    previewLink: 'preview link for campaign c-123'
                });
                expect(self.mockTransport.sendMail).toHaveBeenCalledWith({
                    to: 'somedude@fake.com',
                    from: 'e2eSender@fake.com',
                    subject: 'We\'ve Got It! Amazing Campaign Has Been Submitted for Approval.',
                    html: 'compiled template',
                    text: 'text',
                    attachments: [{
                        filename: 'logo.png',
                        cid: 'reelContentLogo',
                        path: path.join(__dirname, '../../templates/assets/logo.png')
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });

        it('should be able to send using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'campaignSubmitted-template-id',
                    TemplateModel: {
                        firstName: 'Emma',
                        campName: 'Amazing Campaign',
                        previewLink: 'preview link for campaign c-123'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'campaignSubmitted',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending initializedShowcaseCampaign emails', function() {
        beforeEach(function() {
            this.event.options.type = 'initializedShowcaseCampaign';
            this.event.options.toSupport = true;
            this.event.data.campaign = {
                name: 'Amazing Campaign',
                externalCampaigns: {
                    beeswax: {
                        externalId: 'beeswax_id'
                    }
                }
            };
            requestUtils.makeSignedRequest.and.returnValue(Promise.resolve({
                response: {
                    statusCode: 200
                },
                body: {
                    beeswaxIds: {
                        advertiser: 'beeswax_advertiser'
                    }
                }
            }));
        });

        it('should be able to be sent using postmark', function(done) {
            this.event.options.provider = 'postmark';
            this.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'initializedShowcaseCampaign-template-id',
                    TemplateModel: {
                        beeswaxCampaignURI: 'https://www.link.com/beeswax_advertiser/beeswax_id',
                        beeswaxCampaignId: 'beeswax_id',
                        campName: 'Amazing Campaign'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'e2eSupport@fake.com',
                    Tag: 'initializedShowcaseCampaign',
                    TrackOpens: true,
                    Attachments: [{
                        Name: 'logo.png',
                        Content: 'abcdef',
                        ContentType: 'image/png',
                        ContentID: 'cid:reelContentLogo'
                    }]
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });


    describe('sending promotionEnded emails', function() {
        beforeEach(function() {
            this.event.options.type = 'promotionEnded';
            this.event.data.org = {
                id: 'o-123'
            };
            requestUtils.makeSignedRequest.and.returnValue(Promise.resolve({
                response: {
                    statusCode: 200
                },
                body: [
                    {
                        email: 'somedude@fake.com',
                        firstName: 'Henry'
                    }
                ]
            }));
        });

        it('should be able to be sent using postmark', function(done) {
            const self = this;
            self.event.options.provider = 'postmark';
            self.email(this.event).then(function() {
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'promotionEnded--app-template-id',
                    TemplateModel: {
                        firstName: 'Henry',
                        dashboardLink: 'showcase dashboard link'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'promotionEnded--app',
                    TrackOpens: true,
                    Attachments: self.showcasePostmarkAttachments
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });

    describe('sending stats emails', function() {
        beforeEach(function() {
            this.event.options.type = 'stats';
            this.event.options.provider = 'postmark';
            this.event.data.user = {
                email: 'somedude@fake.com',
                firstName: 'Charlie'
            };
            this.event.data.week = 2;
            this.event.data.campaign = {
                id: 'cam-123',
                created: 'Sun Jun 12 2016 00:00:00 GMT-0500 (EST)'
            };
        });

        it('should be able to send', function(done) {
            this.CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
                daily_7: [
                    {'date':'2016-06-26','views':270,'users':210,'clicks':15,'installs':0,'launches':0},
                    {'date':'2016-06-27','views':283,'users':221,'clicks':16,'installs':0,'launches':0},
                    {'date':'2016-06-28','views':245,'users':195,'clicks':3,'installs':0,'launches':0},
                    {'date':'2016-06-29','views':433,'users':395,'clicks':50,'installs':0,'launches':0},
                    {'date':'2016-06-30','views':250,'users':200,'clicks':13,'installs':0,'launches':0},
                    {'date':'2016-07-01','views':125,'users':175,'clicks':3,'installs':0,'launches':0},
                    {'date':'2016-07-02','views':193,'users':125,'clicks':15,'installs':0,'launches':0}
                ]
            }]));

            this.email(this.event).then(() => {
                expect(this.CwrxRequest.prototype.get).toHaveBeenCalledWith('https://root/analytics/campaigns/showcase/apps/cam-123');
                expect(postmark.Client.prototype.sendEmailWithTemplate).toHaveBeenCalledWith({
                    TemplateId: 'weekOneStats--app-template-id',
                    TemplateModel: {
                        firstName: 'Charlie',
                        startDate: 'Jun 26, 2016',
                        endDate: 'Jul 2, 2016',
                        views: 1521,
                        clicks: 115,
                        ctr: 7.56,
                        dashboardLink: 'showcase dashboard link'
                    },
                    InlineCss: true,
                    From: 'e2eSender@fake.com',
                    To: 'somedude@fake.com',
                    Tag: 'weekOneStats--app',
                    TrackOpens: true,
                    Attachments: this.showcasePostmarkAttachments.concat({
                        Name: 'stats_week_2.png',
                        Content: jasmine.any(String),
                        ContentType: 'image/png',
                        ContentID: 'cid:stats'
                    })
                }, jasmine.any(Function));
            }).then(done, done.fail);
        });
    });
});
