'use strict';

var Configurator = require('../helpers/Configurator.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');
const rcUuid = require('rc-uuid');
const waiter = require('../helpers/waiter');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var WATCHMAN_STREAM = process.env.watchmanStream;
var PREFIX = process.env.appPrefix;
var WAIT_TIME = 1000;
var EMAIL_TIMEOUT = 60000;

describe('cwrxStream', function() {
    var producer;
    var mailman;
    var mailman2;
    var mockCampaign;
    var mockUser;
    var mockUpdateRequest;

    function waitForTrue(promise) {
        return Q.resolve().then(promise).then(function(value) {
            return Q.Promise(function(resolve, reject) {
                if(value) {
                    resolve(value);
                } else {
                    setTimeout(function() {
                        waitForTrue(promise).then(resolve, reject);
                    }, WAIT_TIME);
                }
            });
        });
    }

    function waitForEmails(subjects) {
        return Q.all(subjects.map(function(subject) {
            return Q.Promise(function(resolve) {
                mailman.once(subject, resolve);
            });
        }));
    }

    // This beforeAll is dedicated to setting application config
    beforeAll(function(done) {
        const configurator = new Configurator();
        const sharedConfig = {
            secrets: '/opt/sixxy/.watchman.secrets.json',
            appCreds: '/opt/sixxy/.rcAppCreds.json',
            cwrx: {
                api: {
                    root: API_ROOT,
                    analytics: {
                        endpoint: '/api/analytics'
                    },
                    users: {
                        endpoint: '/api/account/users'
                    },
                    orgs: {
                        endpoint: '/api/account/orgs'
                    },
                    promotions: {
                        endpoint: '/api/promotions'
                    },
                    transactions: {
                        endpoint: '/api/transactions'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
                    }
                }
            },
            emails: {
                sender: 'support@cinema6.com',
                dashboardLinks: {
                    selfie: 'http://localhost:9000/#/apps/selfie/campaigns',
                    showcase: 'http://localhost:9000/#/showcase/products'
                },
                manageLink: 'http://localhost:9000/#/apps/selfie/campaigns/manage/:campId/manage',
                reviewLink: 'http://localhost:9000/#/apps/selfie/campaigns/manage/:campId/admin',
                activationTargets: {
                    selfie: 'http://localhost:9000/#/confirm?selfie=selfie',
                    showcase: 'http://localhost:9000/#/showcase/confirm'
                },
                supportAddress: 'c6e2etester@gmail.com',
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
                previewLink: 'https://reelcontent.com/preview/?previewSource=platform&campaign=:campId'
            },
            postmark: {
                templates: {
                    campaignExpired: '672685',
                    campaignOutOfBudget: '672705',
                    campaignActive: '672909',
                    campaignUpdateApproved: '672707',
                    campaignRejected: '672781',
                    campaignUpdateRejected: '672782',
                    newUpdateRequest: '672784',
                    paymentReceipt: '672801',
                    'paymentReceipt--app': '672786',
                    activateAccount: '672787',
                    'activateAccount--app': '672803',
                    accountWasActivated: '672804',
                    'accountWasActivated--app': '672805',
                    passwordChanged: '672788',
                    'passwordChanged--app': '672806',
                    emailChanged: '672807',
                    'emailChanged--app': '672901',
                    failedLogins: '672903',
                    'failedLogins--app': '672904',
                    passwordReset: '672905',
                    'passwordReset--app': '672906',
                    campaignSubmitted: '672810',
                    paymentPlanCanceled: '855802',
                    paymentPlanDowngraded: '855921',
                    paymentPlanUpgraded: '855922'
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: {
                campaignStateChange: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignExpired'
                            },
                            ifData: {
                                previousState: 'active|paused',
                                currentState: 'expired',
                                'campaign.application': '^(studio|selfie)$'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignReachedBudget'
                            },
                            ifData: {
                                currentState: 'outOfBudget',
                                'campaign.application': '^(studio|selfie)$'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignActive'
                            },
                            ifData: {
                                previousState: 'pending',
                                currentState: 'active',
                                'campaign.application': '^(studio|selfie)$'
                            }
                        }
                    ]
                },
                campaignUpdateApproved: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignUpdateApproved'
                            }
                        }
                    ]
                },
                campaignRejected: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignRejected'
                            }
                        }
                    ]
                },
                campaignUpdateRejected: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignUpdateRejected'
                            }
                        }
                    ]
                },
                newUpdateRequest: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                toSupport: true,
                                type: 'newUpdateRequest'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignSubmitted'
                            },
                            ifData: {
                                'updateRequest.initialSubmit': true
                            }
                        }
                    ]
                },
                paymentMade: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'paymentMade'
                            },
                            ifData: {
                                target: '^selfie$'
                            }
                        }
                    ]
                },
                accountCreated: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'activateAccount'
                            }
                        }
                    ]
                },
                accountActivated: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'accountWasActivated'
                            }
                        },
                        {
                            name: 'check_signup_promotion'
                        }
                    ]
                },
                passwordChanged: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'passwordChanged'
                            }
                        }
                    ]
                },
                emailChanged: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'emailChanged',
                                to: '{{oldEmail}}'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'emailChanged',
                                to: '{{newEmail}}'
                            }
                        }
                    ]
                },
                failedLogins: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'failedLogins'
                            }
                        }
                    ]
                },
                forgotPassword: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'forgotPassword'
                            }
                        }
                    ]
                },
                resendActivation: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'activateAccount'
                            }
                        }
                    ]
                },
                paymentPlanChanged: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'paymentPlanUpgraded'
                            }
                        }
                    ]
                },
                paymentPlanPending: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'paymentPlanCanceled'
                            },
                            ifData: {
                                'pendingPaymentPlan.price': '^0$'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'paymentPlanDowngraded'
                            },
                            ifData: {
                                'pendingPaymentPlan.price': '^[1-9].+$'
                            }
                        }
                    ]
                }
            }
        };
        const timeConfig = {
            eventHandlers: { }
        };
        const watchmanConfig = {
            eventHandlers: {
                promotionFulfilled: {
                    actions: [
                        {
                            name: 'create_promotion_credit'
                        }
                    ]
                },
                chargedPaymentPlan: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'paymentMade'
                            },
                            ifData: {
                                target: '^showcase$'
                            }
                        }
                    ]
                }
            }
        };
        Promise.all([
            configurator.updateConfig(`${PREFIX}CwrxStreamApplication`, sharedConfig, cwrxConfig),
            configurator.updateConfig(`${PREFIX}TimeStreamApplication`, sharedConfig, timeConfig),
            configurator.updateConfig(`${PREFIX}WatchmanStreamApplication`, sharedConfig, watchmanConfig)
        ]).then(done, done.fail);
    });

    beforeAll(function(done) {
        mailman = new testUtils.Mailman();
        mailman2 = new testUtils.Mailman({ user: 'c6e2eTester2@gmail.com' });
        mailman.on('error', function(error) { throw new Error(error); });
        mailman2.on('error', function(error) { throw new Error(error); });
        Q.all([mailman, mailman2].map(function(mail) {
            return mail.start();
        })).then(done, done.fail);
    });

    beforeEach(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;
        var awsConfig = {
            region: 'us-east-1'
        };
        const orgId = `o-${rcUuid.createUuid()}`;
        if(AWS_CREDS) {
            awsConfig.accessKeyId = AWS_CREDS.accessKeyId;
            awsConfig.secretAccessKey = AWS_CREDS.secretAccessKey;
        }
        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        this.producers = {
            cwrx: producer,
            watchman: new JsonProducer(WATCHMAN_STREAM, awsConfig)
        };
        mockCampaign = {
            id: 'c-123',
            name: 'Cooltastic Campaign',
            application: 'selfie'
        };
        mockUser = {
            company: 'Evil Corp',
            email: 'c6e2etester@gmail.com',
            id: 'u-123',
            firstName: 'Terry',
            lastName: 'Fakeuser',
            org: orgId
        };
        mockUpdateRequest = {
            rejectionReason: 'your campaign is bad'
        };
        this.mockOrg = {
            id: orgId,
            status: 'active'
        };
        testUtils.resetCollection('users', [mockUser]).then(done, done.fail);
    });

    // Setup watchman app
    beforeEach(function(done) {
        var mockApp = {
            id: 'app-e2e-watchman',
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', edit: 'all' },
                cards: { read: 'all', edit: 'all' },
                users: { read: 'all' },
                orgs: { read: 'all', edit: 'all' },
                promotions: { read: 'all' },
                transactions: { create: 'all' }
            },
            entitlements: {
                directEditCampaigns: true
            },
            fieldValidation: {
                campaigns: {
                    status: {
                        __allowed: true
                    }
                },
                orgs: {
                    promotions: {
                        __allowed: true
                    }
                }
            }
        };

        return testUtils.mongoUpsert('applications', { key: mockApp.key }, mockApp).done(done);
    });

    afterEach(function() {
        mailman.removeAllListeners();
        mailman2.removeAllListeners();
    });

    afterAll(function() {
        mailman.stop();
        mailman2.stop();
    });

    describe('when a campaignStateChange event occurs', function() {
        describe('when an active campaign expires', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'active',
                        currentState: 'expired',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign expired email', function(done) {
                mailman.once('Your Campaign Has Ended', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign.*\\s*reached\\s*its\\s*end\\s*date');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            });
        });

        describe('when a paused campaign expires', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'paused',
                        currentState: 'expired',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign expired email', function(done) {
                mailman.once('Your Campaign Has Ended', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign.*\\s*reached\\s*its\\s*end\\s*date');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            });
        });

        describe('when an out of budget campaign expired', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'outOfBudget',
                        currentState: 'expired',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should not send an email', function(done) {
                mailman.once('Your Campaign Has Ended', function() {
                    done.fail();
                });
                setTimeout(function() {
                    done();
                }, 10000);
            });
        });

        describe('when a campaign transitions to an outOfBudget state', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'active',
                        currentState: 'outOfBudget',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign reached budget email', function(done) {
                mailman.once('Your Campaign is Out of Budget', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe(
                        'support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*is\\s*out\\s*of\\s*budget');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            });
        });

        describe('when a campaign transitions from pending to active', function() {
            beforeEach(function(done) {
                producer.produce({
                    type: 'campaignStateChange',
                    data: {
                        previousState: 'pending',
                        currentState: 'active',
                        campaign: mockCampaign,
                        user: mockUser,
                        date: new Date()
                    }
                }).then(done, done.fail);
            });

            it('should send a campaign active email', function(done) {
                mailman.once('Cooltastic Campaign Is Now Live!', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('.*Cooltastic Campaign.* is live! Sit back and relax\..*');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            });
        });
    });

    it('should send an email when a campaign update request has been approved', function(done) {
        producer.produce({
            type: 'campaignUpdateApproved',
            data: {
                campaign: mockCampaign,
                user: mockUser
            }
        }).then(function() {
            mailman.once('Your Campaign Change Request Has Been Approved', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = new RegExp('Your\\s*change\\s*request\\s*to\\s*campaign.*' +
                    'Cooltastic Campaign.*has\\s*been\\s*approved');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when a campaign has been rejected', function(done) {
        producer.produce({
            type: 'campaignRejected',
            data: {
                campaign: mockCampaign,
                user: mockUser,
                updateRequest: mockUpdateRequest
            }
        }).then(function() {
            mailman.once('Reelcontent Campaign Rejected', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('Your\\s*campaign.*Cooltastic Campaign.*has\\s*been\\s*rejected'),
                    new RegExp('your campaign is bad')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when a campaign udpate request has been rejected', function(done) {
        producer.produce({
            type: 'campaignUpdateRejected',
            data: {
                campaign: mockCampaign,
                user: mockUser,
                updateRequest: mockUpdateRequest
            }
        }).then(function() {
            mailman.once('Your Campaign Change Request Has Been Rejected', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('Your\\s*change\\s*request\\s*to\\s*campaign.*' +
                        'Cooltastic Campaign.*has\\s*been\\s*rejected'),
                    new RegExp('your campaign is bad')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                done();
            });
        }).catch(done.fail);
    });

    describe('when there is a new update request', function() {
        beforeEach(function(done) {
            producer.produce({
                type: 'newUpdateRequest',
                data: {
                    campaign: mockCampaign,
                    user: mockUser,
                    updateRequest: {
                        initialSubmit: true
                    }
                }
            }).then(done, done.fail);
        });

        it('should send an email', function(done) {
            waitForEmails([
                'New update request from Evil Corp for campaign "Cooltastic Campaign"',
                'We\'ve Got It! Cooltastic Campaign Has Been Submitted for Approval.'
            ]).then(function(messages) {
                var msg = messages[0];
                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('created\\s*by\\s*c6e2etester@gmail.com\\s*for\\s*campaign.*' +
                        'Cooltastic Campaign'),
                    new RegExp('review\\s*the\\s*campaign.*\\s*http.*c-123\/admin')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
            }).then(done, done.fail);
        });

        it('should send a campaign submitted email', function(done) {
            waitForEmails([
                'New update request from Evil Corp for campaign "Cooltastic Campaign"',
                'We\'ve Got It! Cooltastic Campaign Has Been Submitted for Approval.'
            ]).then(function(messages) {
                var msg = messages[1];
                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = new RegExp('.*Terry[\\s\\S]*You.*ve submitted Cooltastic Campaign - high five!.*');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
            }).then(done, done.fail);
        });
    });

    describe('sending a paymentMade email receipt', function() {
        var mockPayment, msgRegexes;

        beforeEach(function() {
            mockPayment = {
                amount: 123.45,
                createdAt: '2016-04-04T19:06:11.821Z',
                method: {
                    type: 'creditCard',
                    cardType: 'Visa',
                    cardholderName: 'Johnny Testmonkey',
                    last4: '1234'
                }
            };
        });

        describe('payments made by selfie users', function() {
            beforeEach(function() {
                msgRegexes = [
                    /Amount:\s*\$123.45/,
                    /Processed:\s*Monday,\s*April\s*04,\s*2016/,
                    /Your\s*balance\s*after\s*deposit:\s*\$9001.12/
                ];
            });

            it('should send a receipt email for payments made with a credit card', function(done) {
                producer.produce({
                    type: 'paymentMade',
                    data: {
                        payment: mockPayment,
                        user: mockUser,
                        balance: 9001.12,
                        target: 'selfie'
                    }
                }).then(function() {
                    mailman.once('Your payment has been approved', function(msg) {
                        expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                        expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                        msgRegexes.concat([
                            /Payment\s*Method:\s*Credit\s*Card/,
                            /Cardholder\s*Name:\s*Johnny\s*Testmonkey/,
                            /Card\s*Type:\s*Visa/,
                            /Last\s*4\s*Digits:\s*1234/
                        ]).forEach(function(regex) {
                            expect(regex.test(msg.text)).toBeTruthy('Expected text to match ' + regex);
                            expect(regex.test(msg.html)).toBeTruthy('Expected html to match ' + regex);
                        });
                        expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                        done();
                    });
                }).catch(done.fail);
            });

            it('should send a receipt email for payments made with a paypal account', function(done) {
                mockPayment.method = { type: 'paypal', email: 'johnny@testmonkey.com' };

                producer.produce({
                    type: 'paymentMade',
                    data: {
                        payment: mockPayment,
                        user: mockUser,
                        balance: 9001.12,
                        target: 'selfie'
                    }
                }).then(function() {
                    mailman.once('Your payment has been approved', function(msg) {
                        expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                        expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                        msgRegexes.concat([
                            /Payment\s*Method:\s*PayPal/,
                            /Email:\s*johnny@testmonkey\.com/
                        ]).forEach(function(regex) {
                            expect(regex.test(msg.text)).toBeTruthy('Expected text to match ' + regex);
                            expect(regex.test(msg.html)).toBeTruthy('Expected html to match ' + regex);
                        });
                        expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                        done();
                    });
                }).catch(done.fail);
            });
        });

        describe('payments made by showcase users', function() {
            beforeEach(function() {
                msgRegexes = [
                    /Amount :(.|\n)+\$123\.45/,
                    /Billing Period :(.|\n)+Monday, April 04, 2016 to Tuesday, May 03, 2016/,
                    /Payment Date:(.|\n)+Monday, April 04, 2016/
                ];
                this.mockPaymentPlan = {
                    label: 'The Best Payment Plan'
                };
            });

            it('should send a receipt email for payments made with a credit card', function(done) {
                this.producers.watchman.produce({
                    type: 'chargedPaymentPlan',
                    data: {
                        org: this.mockOrg,
                        paymentPlan: this.mockPaymentPlan,
                        payment: mockPayment,
                        date: Date.now(),
                        target: 'showcase'
                    }
                }).then(function() {
                    mailman.once('Your payment has been approved', function(msg) {
                        expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                        expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                        msgRegexes.concat([
                            /Payment Method[\s\S]+Credit Card/,
                            /Cardholder Name: Johnny Testmonkey/,
                            /Card Type: Visa/,
                            /Last 4 Digits: 1234/,
                            /The Best Payment Plan/
                        ]).forEach(function(regex) {
                            expect(regex.test(msg.text)).toBeTruthy('Expected text to match ' + regex);
                            expect(regex.test(msg.html)).toBeTruthy('Expected html to match ' + regex);
                        });
                        expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                        done();
                    });
                }).catch(done.fail);
            });

            it('should send a receipt email for payments made with a paypal account', function(done) {
                mockPayment.method = { type: 'paypal', email: 'johnny@testmonkey.com' };

                this.producers.watchman.produce({
                    type: 'chargedPaymentPlan',
                    data: {
                        org: this.mockOrg,
                        paymentPlan: this.mockPaymentPlan,
                        payment: mockPayment,
                        date: Date.now(),
                        target: 'showcase'
                    }
                }).then(function() {
                    mailman.once('Your payment has been approved', function(msg) {
                        expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                        expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                        msgRegexes.concat([
                            /Payment Method[\s\S]+PayPal/,
                            /Email: johnny@testmonkey\.com/,
                            /The Best Payment Plan/
                        ]).forEach(function(regex) {
                            expect(regex.test(msg.text)).toBeTruthy('Expected text to match ' + regex);
                            expect(regex.test(msg.html)).toBeTruthy('Expected html to match ' + regex);
                        });
                        expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                        done();
                    });
                }).catch(done.fail);
            });
        });
    });

    describe('when a new user account has been created', function() {
        it('should send an activation email', function(done) {
            producer.produce({
                type: 'accountCreated',
                data: {
                    token: 'secret-token',
                    user: mockUser
                }
            }).then(function() {
                return waitForEmails(['Terry, Welcome to Reelcontent']);
            }).then(function(messages) {
                var msg = messages[0];

                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
            }).then(done, done.fail);
        });

        it('should send an activation email for a showcase user account', function(done) {
            producer.produce({
                type: 'accountCreated',
                data: {
                    token: 'secret-token',
                    user: mockUser,
                    target: 'showcase'
                }
            }).then(function() {
                return waitForEmails(['Terry, Welcome to Reelcontent Apps']);
            }).then(function(messages) {
                var msg = messages[0];
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;

                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                expect(msg.text.toLowerCase()).toContain('welcome to reelcontent apps');
            }).then(done, done.fail);
        });
    });

    describe('when an account was activated', function() {
        it('should send an email notifying the user that their account has been activated', function(done) {
            producer.produce({
                type: 'accountActivated',
                data: {
                    user: mockUser
                }
            }).then(function() {
                return waitForEmails(['Terry, Your Reelcontent Account Is Ready To Go']);
            }).then(function(messages) {
                var msg = messages[0];
                var regex = /account\s*is\s*now\s*active/;

                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
            }).then(done, done.fail);
        });

        it('should send an email notifying the user that their showcase account has been activated', function(done) {
            producer.produce({
                type: 'accountActivated',
                data: {
                    user: mockUser,
                    target: 'showcase'
                }
            }).then(function() {
                return waitForEmails(['Terry, Your Reelcontent Account Is Ready To Go']);
            }).then(function(messages) {
                var msg = messages[0];
                var regex = /Terry,\s+your\s+account/;

                expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
            }).then(done, done.fail);
        });

        describe('with a promotion', function() {
            var testOrg, testPromotions;
            beforeEach(function(done) {
                mockUser.org = 'o-e2e-1';
                mockUser.promotion = 'pro-valid';
                testOrg = {
                    id: 'o-e2e-1',
                    name: 'test org',
                    status: 'active',
                    promotions: []
                };
                testPromotions = [
                    { id: 'pro-valid', status: 'active', type: 'signupReward', data: { rewardAmount: 50 } },
                    { id: 'pro-inactive', status: 'inactive', type: 'signupReward', data: { rewardAmount: 50 } },
                    { id: 'pro-loyalty', status: 'active', type: 'loyaltyReward', data: { rewardAmount: 50 } },
                    { id: 'pro-trial', status: 'active', type: 'freeTrial', data: { trialLength: 14 } }
                ];

                return Q.all([
                    testUtils.resetCollection('orgs', testOrg),
                    testUtils.resetCollection('promotions', testPromotions),
                    testUtils.resetPGTable('fct.billing_transactions')
                ]).then(function() { done(); }, done.fail);
            });

            it('should apply the promotional credit to the org\'s account balance', function(done) {
                function waitForTransaction() {
                    return waitForTrue(function() {
                        return testUtils.pgQuery(
                            'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                            ['o-e2e-1']
                        ).then(function(results) {
                            return results.rows.length > 0;
                        });
                    });
                }

                producer.produce({
                    type: 'accountActivated',
                    data: {
                        user: mockUser
                    }
                }).then(function() {
                    return waitForTransaction();
                }).then(function() {
                    return testUtils.mongoFind('orgs', { id: 'o-e2e-1' });
                }).then(function(orgs) {
                    expect(orgs[0].promotions).toEqual([{
                        id: 'pro-valid',
                        created: jasmine.any(Date),
                        lastUpdated: orgs[0].promotions[0].created,
                        status: 'active'
                    }]);
                    return testUtils.pgQuery(
                        'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                        ['o-e2e-1']
                    );
                }).then(function(results) {
                    expect(results.rows.length).toBe(1);
                    expect(results.rows[0]).toEqual(jasmine.objectContaining({
                        rec_key         : jasmine.any(String),
                        rec_ts          : jasmine.any(Date),
                        transaction_id  : jasmine.any(String),
                        transaction_ts  : results.rows[0].rec_ts,
                        org_id          : 'o-e2e-1',
                        amount          : '50.0000',
                        sign            : 1,
                        units           : 1,
                        campaign_id     : null,
                        braintree_id    : null,
                        promotion_id    : 'pro-valid',
                        description     : JSON.stringify({eventType: 'credit', source: 'promotion'})
                    }));
                    done();
                }).catch(done.fail);
            });

            it('should not apply the promotional credit if the promotion is invalid', function(done) {
                Q.all(['pro-inactive', 'pro-loyalty', 'faaaaaaake'].map(function(promId) {
                    var newUser = JSON.parse(JSON.stringify(mockUser));
                    newUser.promotion = promId;

                    return producer.produce({ type: 'accountActivated', data: { user: newUser } });
                }))
                .then(function() {
                    return Q.delay(5000);
                })
                .then(function() {
                    return testUtils.mongoFind('orgs', { id: 'o-e2e-1' });
                }).then(function(orgs) {
                    expect(orgs[0].promotions).toEqual([]);

                    return testUtils.pgQuery(
                        'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                        ['o-e2e-1']
                    );
                }).then(function(results) {
                    expect(results.rows.length).toBe(0);
                    done();
                }).catch(done.fail);
            });

            it('should not apply the promotional credit for freeTrials', function(done) {
                var newUser = JSON.parse(JSON.stringify(mockUser));

                newUser.promotion = 'pro-trial';

                producer.produce({ type: 'accountActivated', data: { user: newUser } }).then(function() {
                    return Q.delay(5000);
                }).then(function() {
                    return testUtils.mongoFind('orgs', { id: 'o-e2e-1' });
                }).then(function(orgs) {
                    expect(orgs[0].promotions).toEqual([{
                        id: 'pro-trial',
                        created: jasmine.any(Date),
                        lastUpdated: orgs[0].promotions[0].created,
                        status: 'active'
                    }]);
                }).then(function() {
                    return testUtils.pgQuery(
                        'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                        ['o-e2e-1']
                    );
                }).then(function(results) {
                    expect(results.rows.length).toBe(0);
                }).then(done, done.fail);
            });
        });
    });

    describe('notifying the user that their password has been changed', function() {
        it('should be able to send an email formatted for selfie users', function(done) {
            producer.produce({
                type: 'passwordChanged',
                data: {
                    date: new Date(),
                    user: mockUser
                }
            }).then(function() {
                mailman.once('Reelcontent Password Change Notice', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /password\s*was\s*changed\s*on.*at.*/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            }).catch(done.fail);
        });

        it('should be able to send an email formatted for showcase users', function(done) {
            producer.produce({
                type: 'passwordChanged',
                data: {
                    date: new Date(),
                    user: mockUser,
                    target: 'showcase'
                }
            }).then(function() {
                mailman.once('Reelcontent Password Change Notice', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /Terry, Just a quick note/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            }).catch(done.fail);
        });
    });

    describe('sending an email to notify of an email change', function() {
        describe('for selfie campaigns', function() {
            beforeEach(function(done) {
                mockUser.email = 'c6e2etester2@gmail.com';
                producer.produce({
                    type: 'emailChanged',
                    data: {
                        user: mockUser,
                        oldEmail: 'c6e2etester@gmail.com',
                        newEmail: 'c6e2etester2@gmail.com'
                    }
                }).then(done, done.fail);
            });

            it('should be able to notify the old email address', function(done) {
                return Q.Promise(function(resolve) {
                    var emails = [null, null];
                    mailman.once('Your Email Has Been Changed', function(msg) {
                        emails[0] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                    mailman2.once('Your Email Has Been Changed', function(msg) {
                        emails[1] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                }).spread(function(msg) {
                    var regex = /c6e2etester2@gmail\.com/;

                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                }).then(done, done.fail);
            });

            it('should be able to notify the new email address', function(done) {
                return Q.Promise(function(resolve) {
                    var emails = [null, null];
                    mailman.once('Your Email Has Been Changed', function(msg) {
                        emails[0] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                    mailman2.once('Your Email Has Been Changed', function(msg) {
                        emails[1] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                }).spread(function(firstMsg, msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester2@gmail.com');
                    [
                        /c6e2etester@gmail\.com/,
                        /c6e2etester2@gmail\.com/
                    ].forEach(function(regex) {
                        expect(msg.text).toMatch(regex);
                        expect(msg.html).toMatch(regex);
                    });
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                }).then(done, done.fail);
            });
        });

        describe('for showcase campaigns', function() {
            beforeEach(function(done) {
                mockUser.email = 'c6e2etester2@gmail.com';
                return producer.produce({
                    type: 'emailChanged',
                    data: {
                        user: mockUser,
                        oldEmail: 'c6e2etester@gmail.com',
                        newEmail: 'c6e2etester2@gmail.com',
                        target: 'showcase'
                    }
                }).then(done, done.fail);
            });

            it('should be able to notify the old email address', function(done) {
                return Q.Promise(function(resolve) {
                    var emails = [null, null];
                    mailman.once('Your Email Has Been Changed', function(msg) {
                        emails[0] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                    mailman2.once('Your Email Has Been Changed', function(msg) {
                        emails[1] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                }).spread(function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    [
                        /c6e2etester@gmail\.com/,
                        /c6e2etester2@gmail\.com/
                    ].forEach(function(regex) {
                        expect(msg.text).toMatch(regex);
                        expect(msg.html).toMatch(regex);
                    });
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                }).then(done, done.fail);
            });

            it('should be able to notify the new email address', function(done) {
                return Q.Promise(function(resolve) {
                    var emails = [null, null];
                    mailman.once('Your Email Has Been Changed', function(msg) {
                        emails[0] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                    mailman2.once('Your Email Has Been Changed', function(msg) {
                        emails[1] = msg;
                        if(emails[0] && emails[1]) {
                            resolve(emails);
                        }
                    });
                }).spread(function(firstMsg, msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester2@gmail.com');
                    [
                        /c6e2etester@gmail\.com/,
                        /c6e2etester2@gmail\.com/
                    ].forEach(function(regex) {
                        expect(msg.text).toMatch(regex);
                        expect(msg.html).toMatch(regex);
                    });
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                }).then(done, done.fail);
            });
        });
    });

    describe('sending an email after multiple failed password attempts', function() {
        it('should be able to send an email formatted for selfie users', function(done) {
            producer.produce({
                type: 'failedLogins',
                data: {
                    user: mockUser
                }
            }).then(function() {
                mailman.once('Reelcontent: Multiple-Failed Logins', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /consecutive\s*failed\s*login\s*attempts/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            }).catch(done.fail);
        });

        it('should be able to send an email formatted for showcase users', function(done) {
            producer.produce({
                type: 'failedLogins',
                data: {
                    user: mockUser,
                    target: 'showcase'
                }
            }).then(function() {
                mailman.once('Reelcontent: Multiple-Failed Logins', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /Terry,\s+Looks\s+like\s+someone\s+has\s+tried\s+to\s+log\s+into\s+your\s+account/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            }).catch(done.fail);
        });
    });

    describe('sending an email when the user has requested a password reset', function() {
        it('should work for selfie users', function(done) {
            producer.produce({
                type: 'forgotPassword',
                data: {
                    target: 'selfie',
                    token: 'secret-token',
                    user: mockUser
                }
            }).then(function() {
                mailman.once('Forgot Your Password?', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            }).catch(done.fail);
        });

        it('should work for showcase users', function(done) {
            producer.produce({
                type: 'forgotPassword',
                data: {
                    target: 'showcase',
                    token: 'secret-token',
                    user: mockUser
                }
            }).then(function() {
                mailman.once('Forgot Your Password?', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(EMAIL_TIMEOUT);
                    done();
                });
            }).catch(done.fail);
        });
    });

    it('should be able to resend an activation email', function(done) {
        producer.produce({
            type: 'resendActivation',
            data: {
                target: 'selfie',
                token: 'secret-token',
                user: mockUser
            }
        }).then(function() {
            mailman.once('Terry, Welcome to Reelcontent', function(msg) {
                expect(msg.from[0].address).toBe('support@cinema6.com');
                expect(msg.to[0].address).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect(new Date() - msg.date).toBeLessThan(EMAIL_TIMEOUT);
                done();
            });
        }).catch(done.fail);
    });

    it('should be able to send a payment plan canceled email', function (done) {
        producer.produce({
            type: 'paymentPlanPending',
            data: {
                pendingPaymentPlan: {
                    price: 0
                },
                org: this.mockOrg,
                effectiveDate: new Date()
            }
        }).then(() => {
            return waiter.waitFor(() => {
                return new Promise(resolve => {
                    mailman.once('Your subscription has been cancelled', msg => resolve(msg));
                });
            });
        }).then(msg => {
            expect(msg.from[0].address).toBe('support@cinema6.com');
            expect(msg.to[0].address).toBe('c6e2etester@gmail.com');
            const regex = /plan will be cancelled/;
            expect(msg.text).toMatch(regex);
            expect(msg.html).toMatch(regex);
            expect(new Date() - msg.date).toBeLessThan(EMAIL_TIMEOUT);
        }).then(done, done.fail);
    });

    it('should be able to send a payment plan downgraded email', function (done) {
        producer.produce({
            type: 'paymentPlanPending',
            data: {
                currentPaymentPlan: {
                    label: 'Better Plan',
                    price: 149.99,
                    maxCampaigns: 3
                },
                pendingPaymentPlan: {
                    label: 'Worse Plan',
                    price: 49.99,
                    maxCampaigns: 1
                },
                org: this.mockOrg,
                effectiveDate: new Date()
            }
        }).then(() => {
            return waiter.waitFor(() => {
                return new Promise(resolve => {
                    mailman.once('Your plan is being downgraded', msg => resolve(msg));
                });
            });
        }).then(msg => {
            expect(msg.from[0].address).toBe('support@cinema6.com');
            expect(msg.to[0].address).toBe('c6e2etester@gmail.com');
            const regex = /downgrading your plan/;
            expect(msg.text).toMatch(regex);
            expect(msg.html).toMatch(regex);
            expect(new Date() - msg.date).toBeLessThan(EMAIL_TIMEOUT);
        }).then(done, done.fail);
    });

    it('should be able to send a payment plan upgraded email', function (done) {
        const paymentPlans = [
            {
                id: `pp-${rcUuid.createUuid()}`,
                price: 0,
                maxCampaigns: 0,
                viewsPerMonth: 0,
                label: '--canceled--',
                status: 'active'
            },
            {
                id: `pp-${rcUuid.createUuid()}`,
                price: 49.99,
                maxCampaigns: 1,
                viewsPerMonth: 2000,
                label: 'Starter',
                status: 'active'
            }
        ];
        testUtils.resetCollection('paymentPlans', paymentPlans).then(() => {
            return producer.produce({
                type: 'paymentPlanChanged',
                data: {
                    previousPaymentPlanId: paymentPlans[0].id,
                    currentPaymentPlanId: paymentPlans[1].id,
                    org: this.mockOrg
                }
            });
        }).then(() => {
            return waiter.waitFor(() => {
                return new Promise(resolve => {
                    mailman.once('Your plan has been upgraded', msg => resolve(msg));
                });
            });
        }).then(msg => {
            expect(msg.from[0].address).toBe('support@cinema6.com');
            expect(msg.to[0].address).toBe('c6e2etester@gmail.com');
            const regex = /upgraded your plan/;
            expect(msg.text).toMatch(regex);
            expect(msg.html).toMatch(regex);
            expect(new Date() - msg.date).toBeLessThan(EMAIL_TIMEOUT);
        }).then(done, done.fail);
    });
});
