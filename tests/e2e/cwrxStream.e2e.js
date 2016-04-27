'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var WAIT_TIME = 1000;

describe('cwrxStream', function() {
    var producer;
    var mailman;
    var mailman2;
    var mockCampaign;
    var mockUser;
    var mockUpdateRequest;

    beforeAll(function(done) {
        mailman = new testUtils.Mailman();
        mailman2 = new testUtils.Mailman({ user: 'c6e2eTester2@gmail.com' });
        mailman.on('error', function(error) { throw new Error(error); });
        mailman2.on('error', function(error) { throw new Error(error); });
        Q.all([mailman, mailman2].map(function(mail) {
            return mail.start();
        })).then(done, done.fail);
    });

    beforeEach(function() {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
        var awsConfig = {
            region: 'us-east-1',
        };
        if(AWS_CREDS) {
            awsConfig.accessKeyId = AWS_CREDS.accessKeyId;
            awsConfig.secretAccessKey = AWS_CREDS.secretAccessKey;
        }
        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        mockCampaign = {
            id: 'c-123',
            name: 'Cooltastic Campaign'
        };
        mockUser = {
            company: 'Evil Corp',
            email: 'c6e2etester@gmail.com',
            id: 'u-123',
            firstName: 'Terry'
        };
        mockUpdateRequest = {
            rejectionReason: 'your campaign is bad'
        };
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

    function waitForTrue(promise) {
        return Q.resolve().then(promise).then(function(value) {
            if(!value) {
                return Q.Promise(function(resolve, reject) {
                    setTimeout(function() {
                        waitForTrue(promise).then(resolve, reject);
                    }, WAIT_TIME);
                });
            }
        });
    }

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
                    expect(msg.from[0].address.toLowerCase()).toBe(
                        'no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*\\s*reached\\s*its\\s*end\\s*date');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
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
                    expect(msg.from[0].address.toLowerCase()).toBe(
                        'no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*\\s*reached\\s*its\\s*end\\s*date');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
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
                        'no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('Your\\s*campaign.*Cooltastic Campaign' +
                        '.*is\\s*out\\s*of\\s*budget');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
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
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = new RegExp('.*"Cooltastic Campaign" is live! Sit back and relax\..*');
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
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
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = new RegExp('Your\\s*change\\s*request\\s*to\\s*campaign.*' +
                    'Cooltastic Campaign.*has\\s*been\\s*approved');
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
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
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('Your\\s*campaign.*Cooltastic Campaign.*has\\s*been\\s*rejected'),
                    new RegExp('your campaign is bad')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(30000);
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
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('Your\\s*change\\s*request\\s*to\\s*campaign.*' +
                        'Cooltastic Campaign.*has\\s*been\\s*rejected'),
                    new RegExp('your campaign is bad')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an email when there is a new update request', function(done) {
        producer.produce({
            type: 'newUpdateRequest',
            data: {
                campaign: mockCampaign,
                user: mockUser
            }
        }).then(function() {
            mailman.once('New update request from Evil Corp for campaign "Cooltastic Campaign"',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                [
                    new RegExp('created\\s*by\\s*c6e2etester@gmail.com\\s*for\\s*campaign.*' +
                        'Cooltastic Campaign'),
                    new RegExp('review\\s*the\\s*campaign.*\\s*http.*c-123\/admin')
                ].forEach(function(regex) {
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                });
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    describe('when handling a paymentMade event', function() {
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
                    balance: 9001.12
                }
            }).then(function() {
                mailman.once('Your payment has been approved', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
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
                    expect((new Date() - msg.date)).toBeLessThan(30000);
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
                    balance: 9001.12
                }
            }).then(function() {
                mailman.once('Your payment has been approved', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    msgRegexes.concat([
                        /Payment\s*Method:\s*PayPal/,
                        /Email:\s*johnny@testmonkey\.com/
                    ]).forEach(function(regex) {
                        expect(regex.test(msg.text)).toBeTruthy('Expected text to match ' + regex);
                        expect(regex.test(msg.html)).toBeTruthy('Expected html to match ' + regex);
                    });
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });
    });

    it('should send an activation email when a new user account has been created', function(done) {
        producer.produce({
            type: 'accountCreated',
            data: {
                token: 'secret-token',
                user: mockUser
            }
        }).then(function() {
            mailman.once('Terry, Welcome to Reelcontent',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should send an activation email when a new bob account has been created', function(done) {
        producer.produce({
            type: 'accountCreated',
            data: {
                token: 'secret-token',
                user: mockUser,
                target: 'bob'
            }
        }).then(function() {
            mailman.once('Terry, Welcome to Reelcontent Marketing!',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                expect(msg.text).toContain('Welcome to Reelcontent Marketing!');
                done();
            });
        }).catch(done.fail);
    });

    describe('when an account was activated', function() {
        it('should send an email notifying the user that their account has been activated',
                function(done) {
            producer.produce({
                type: 'accountActivated',
                data: {
                    user: mockUser
                }
            }).then(function() {
                mailman.once('Terry, Your Reelcontent Account Is Ready To Go',
                        function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /account\s*is\s*now\s*active/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });

        it('should send an email notifying the user that their bob account has been activated',
                function(done) {
            producer.produce({
                type: 'accountActivated',
                data: {
                    user: mockUser,
                    target: 'bob'
                }
            }).then(function() {
                mailman.once('Terry, Your Reelcontent Account Is Ready To Go',
                        function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /account\s*is\s*now\s*active/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect(msg.text).toContain('ADD MY FIRST PRODUCT');
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });

        describe('with a promotion', function() {
            /* jshint camelcase: false */
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
                .then(Q.delay(5000))
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

            /* jshint camelcase: true */
        });
    });

    it('should send an email notifying the user that their password has been changed',
            function(done) {
        producer.produce({
            type: 'passwordChanged',
            data: {
                date: new Date(),
                user: mockUser
            }
        }).then(function() {
            mailman.once('Reelcontent Password Change Notice',
                    function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /password\s*was\s*changed\s*on.*at.*/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    describe('sending an email to notify of a password change', function() {
        it('should be able to notify the old email address', function(done) {
            producer.produce({
                type: 'emailChanged',
                data: {
                    user: mockUser,
                    oldEmail: 'c6e2etester@gmail.com',
                    newEmail: 'c6e2etester2@gmail.com'
                }
            }).then(function() {
                mailman.once('Your Email Has Been Changed', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                    var regex = /c6e2etester2@gmail.com/;
                    expect(msg.text).toMatch(regex);
                    expect(msg.html).toMatch(regex);
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });

        it('should be able to notify the new email address', function(done) {
            mockUser.email = 'c6e2etester2@gmail.com';
            producer.produce({
                type: 'emailChanged',
                data: {
                    user: mockUser,
                    oldEmail: 'c6e2etester@gmail.com',
                    newEmail: 'c6e2etester2@gmail.com'
                }
            }).then(function() {
                mailman2.once('Your Email Has Been Changed', function(msg) {
                    expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                    expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester2@gmail.com');
                    [
                        /c6e2etester@gmail.com/,
                        /c6e2etester2@gmail.com/
                    ].forEach(function(regex) {
                        expect(msg.text).toMatch(regex);
                        expect(msg.html).toMatch(regex);
                    });
                    expect((new Date() - msg.date)).toBeLessThan(30000);
                    done();
                });
            }).catch(done.fail);
        });
    });

    it('should be able to send an email after multiple failed password attempts', function(done) {
        producer.produce({
            type: 'failedLogins',
            data: {
                user: mockUser
            }
        }).then(function() {
            mailman.once('Reelcontent: Multiple-Failed Logins', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /consecutive\s*failed\s*login\s*attempts/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });

    it('should be able to send an email when the user has requested a password reset',
            function(done) {
        producer.produce({
            type: 'forgotPassword',
            data: {
                target: 'selfie',
                token: 'secret-token',
                user: mockUser
            }
        }).then(function() {
            mailman.once('Forgot Your Password?', function(msg) {
                expect(msg.from[0].address.toLowerCase()).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect((new Date() - msg.date)).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
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
            mailman.once('Welcome to Reelcontent Video Ads!', function(msg) {
                expect(msg.from[0].address).toBe('no-reply@reelcontent.com');
                expect(msg.to[0].address).toBe('c6e2etester@gmail.com');
                var regex = /https?:\/\/.+id.+u-123.+token.+secret-token/;
                expect(msg.text).toMatch(regex);
                expect(msg.html).toMatch(regex);
                expect(new Date() - msg.date).toBeLessThan(30000);
                done();
            });
        }).catch(done.fail);
    });
});
