'use strict';

/* jshint camelcase:false */

var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var paymentPlans = require('../../environments/development.json').default_attributes.watchman.app.config.paymentPlans;

function createId(prefix) {
    return prefix + '-' + uuid.createUuid();
}

function waitUntil(predicate) {
    function check() {
        return q(predicate()).then(function(value) {
            if (value) {
                return value;
            } else {
                return q.delay(500).then(check);
            }
        });
    }

    return check();
}

function wait(time) {
    return waitUntil(function() { return q.delay(time).thenResolve(true); });
}

describe('cwrxStream campaignCreated', function() {
    var producer, request;
    var user, org, promotions, campaign, paymentPlan;

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function campaignCreatedEvent(time) {
        return producer.produce({
            type: 'campaignCreated',
            data: {
                campaign: campaign,
                date: (time || moment()).format()
            }
        });
    }

    function updatePaymentPlanStart(start) {
        return request.put({
            url: api('/api/account/orgs/' + org.id),
            json: {
                paymentPlanStart: start && start.format()
            }
        }).spread(function(body) { return body; });
    }

    function updatePaymentPlan(id) {
        return request.put({
            url: api('/api/account/orgs/' + org.id),
            json: {
                paymentPlanId: id
            }
        }).spread(function(body) { return body; });
    }

    function updatePromotions(promotions) {
        return request.put({
            url: api('/api/account/orgs/' + org.id),
            json: {
                promotions: promotions
            }
        }).spread(function(body) { return body; });
    }

    function getOrg() {
        return request.get({
            url: api('/api/account/orgs/' + org.id),
            json: true
        }).spread(function(body) { return body; });
    }

    function createUser() {
        var orgId = createId('o');
        var userId = createId('u');

        return testUtils.resetCollection('orgs', [{
            id: orgId,
            status: 'active',
            name: 'The Best Org',
            paymentPlanId: Object.keys(paymentPlans)[0],
            paymentPlanStart: moment().format(),
        }]).then(function makeUser() {
            return testUtils.resetCollection('users', [{
                id: userId,
                status: 'active',
                firstName: 'Johnny',
                lastName: 'Testmonkey',
                company: 'Bananas 4 Bananas, Inc.',
                email: 'c6e2etester@gmail.com',
                password: '$2a$10$XomlyDak6mGSgrC/g1L7FO.4kMRkj4UturtKSzy6mFeL8QWOBmIWq',
                org: orgId,
                policies: ['manageAllOrgs']
            }]);
        }).then(function getUser() {
            return request.get({
                url: api('/api/account/users/' + userId)
            }).then(ld.property(0));
        }).then(function login(user) {
            return request.post({
                url: api('/api/auth/login'),
                json: {
                    email: user.email,
                    password: 'password'
                },
                jar: true
            });
        }).then(function fetchEntities() {
            return q.all([
                request.get({
                    url: api('/api/account/users/' + userId)
                }).then(ld.property(0)),
                request.get({
                    url: api('/api/account/orgs/' + orgId)
                }).then(ld.property(0))
            ]);
        });
    }

    function deleteUser(user) {
        return request.delete({
            url: api('/api/account/users/' + user.id)
        }).then(function deleteOrg() {
            return request.delete({
                url: api('/api/account/orgs/' + user.org)
            });
        }).thenResolve(null);
    }

    beforeAll(function() {
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
    });

    beforeEach(function(done) {
        var cwrxApp = {
            id: 'app-cwrx',
            created: new Date(),
            lastUpdated: new Date(),
            status: 'active',
            key: 'cwrx-services',
            secret: 'ade2cfd7ec2e71d54064fb8cfb1cc92be1d01ffd',
            permissions: {
                orgs: { create: 'all' },
                advertisers: { create: 'all' },
                transactions: { create: 'all' }
            },
            fieldValidation: {
                advertisers: {
                    org: { __allowed: true }
                },
                orgs: {
                    referralCode: { __allowed: true },
                    paymentPlanId: { __allowed: true }
                }
            },
            entitlements: {
                directEditCampaigns: true
            }
        };
        var watchmanApp = {
            id: createId('app'),
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                users: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                orgs: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                promotions: { read: 'all' },
                transactions: { create: 'all' }
            },
            entitlements: {
                directEditCampaigns: true,
                makePaymentForAny: true
            },
            fieldValidation: {
                campaigns: {
                    status: {
                        __allowed: true
                    }
                },
                orgs: {
                    paymentPlanStart: { __allowed: true },
                    paymentPlanId: { __allowed: true },
                    promotions: { __allowed: true }
                }
            }
        };

        promotions = [
            {
                id: createId('ref'),
                status: 'active',
                created: moment().subtract(6, 'months').format(),
                lastUpdated: moment().subtract(6, 'months').format(),
                name: '10-Day Free Trial',
                type: 'freeTrial',
                data: {
                    trialLength: 10
                }
            },
            {
                id: createId('ref'),
                status: 'active',
                created: moment().subtract(7, 'months').format(),
                lastUpdated: moment().subtract(7, 'months').format(),
                name: '$50 Bonus',
                type: 'signupReward',
                data: {
                    rewardAmount: 50
                }
            },
            {
                id: createId('ref'),
                status: 'active',
                created: moment().subtract(8, 'months').format(),
                lastUpdated: moment().subtract(8, 'months').format(),
                name: 'One Week Free Trial',
                type: 'freeTrial',
                data: {
                    trialLength: 7
                }
            }
        ];

        q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp]),
            testUtils.resetCollection('policies', []),
            testUtils.resetCollection('orgs', []),
            testUtils.resetCollection('users', []),
            testUtils.resetCollection('promotions', promotions)
        ]).then(function() {
            return createUser();
        }).spread(function(/*user, org*/) {
            user = arguments[0];
            org = arguments[1];

            paymentPlan = paymentPlans[org.paymentPlanId];

            campaign = {
                id: createId('cam'),
                user: user.id,
                org: org.id,
                application: 'bob',
                cards: [],
                created: moment().format()
            };
        }).then(done, done.fail);
    });

    afterEach(function(done) {
        q.all([
            deleteUser(user)
        ]).then(done, done.fail);
    });

    describe('if the org has a paymentPlanStart', function() {
        var existing;

        beforeEach(function(done) {
            existing = moment().subtract(3, 'days');

            updatePaymentPlanStart(existing).then(function() {
                return campaignCreatedEvent();
            }).then(function() {
                return wait(5000);
            }).then(function() {
                return getOrg();
            }).then(function(/*org*/) {
                org = arguments[0];
            }).then(done, done.fail);
        });

        it('should not update the org\'s paymentPlanStart', function() {
            expect(moment(org.paymentPlanStart).format()).toEqual(existing.format(), 'paymentPlanStart was updated.');
        });

        it('should not give the org any credits', function(done) {
            testUtils.pgQuery(
                'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                [org.id]
            ).then(function(result) {
                expect(result.rows.length).toBe(0, 'A transaction was created.');
            }).then(done, done.fail);
        });
    });

    describe('if the org has no paymentPlanStart', function() {
        beforeEach(function(done) {
            updatePaymentPlanStart(null).then(function() {
                return getOrg();
            }).then(function(/*org*/) {
                org = arguments[0];
            }).then(done, done.fail);
        });

        describe('and no payment plan', function() {
            beforeEach(function(done) {
                updatePaymentPlan(null).then(function() {
                    return campaignCreatedEvent();
                }).then(function() {
                    return wait(5000);
                }).then(function() {
                    return getOrg();
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            it('should not give the org a paymentPlanStart', function() {
                expect(org.paymentPlanStart).toBeNull();
            });

            it('should not give the org any credits', function(done) {
                testUtils.pgQuery(
                    'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                    [org.id]
                ).then(function(result) {
                    expect(result.rows.length).toBe(0, 'A transaction was created.');
                }).then(done, done.fail);
            });
        });

        describe('and has a paymentPlan', function() {
            var now;

            beforeEach(function(done) {
                now = moment();

                updatePaymentPlan(Object.keys(paymentPlans)[1]).then(function() {
                    return getOrg();
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            describe('but no promotions', function() {
                beforeEach(function(done) {
                    updatePromotions([]).then(function() {
                        return campaignCreatedEvent(now);
                    }).then(function() {
                        return wait(5000);
                    }).then(function() {
                        return waitUntil(function() {
                            return getOrg().then(function(org) {
                                return org.paymentPlanStart && org;
                            });
                        });
                    }).then(function(/*org*/) {
                        org = arguments[0];
                    }).then(done, done.fail);
                });

                it('should give the org a paymentPlanStart of now', function() {
                    expect(moment(org.paymentPlanStart).isSame(now, 'day')).toBe(true, 'paymentPlanStart is not today.');
                });

                it('should not give the org any credits', function(done) {
                    testUtils.pgQuery(
                        'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                        [org.id]
                    ).then(function(result) {
                        expect(result.rows.length).toBe(0, 'A transaction was created.');
                    }).then(done, done.fail);
                });
            });

            describe('and promotions', function() {
                var transactions;

                beforeEach(function(done) {
                    updatePromotions(promotions.map(function(promotion) {
                        return {
                            id: promotion.id,
                            created: now.format(),
                            lastUpdated: now.format(),
                            status: 'active'
                        };
                    })).then(function() {
                        return campaignCreatedEvent(now);
                    }).then(function() {
                        return waitUntil(function() {
                            return q.all([
                                testUtils.pgQuery(
                                    'SELECT * FROM fct.billing_transactions WHERE org_id = $1 ORDER BY amount',
                                    [org.id]
                                ),
                                getOrg()
                            ]).spread(function(queryResult, org) {
                                return org.paymentPlanStart && queryResult.rows.length === 2 && [org, queryResult.rows];
                            });
                        });
                    }).spread(function(/*org, transaction*/) {
                        org = arguments[0];
                        transactions = arguments[1];
                    }).then(done, done.fail);
                });

                it('should give the org a paymentPlanStart computed from the transactions', function() {
                    expect(moment(org.paymentPlanStart).isSame(moment(now).add(17, 'days'), 'day')).toBe(true, 'paymentPlanStart is the wrong day.');
                });

                it('should create transactions for each promotion', function() {
                    expect(transactions[0]).toEqual(jasmine.objectContaining({
                        rec_key: jasmine.any(String),
                        rec_ts: jasmine.any(Date),
                        transaction_id: jasmine.any(String),
                        transaction_ts: jasmine.any(Date),
                        org_id: org.id,
                        amount: '9.3300',
                        sign: 1,
                        units: 1,
                        campaign_id: null,
                        braintree_id: null,
                        promotion_id: promotions[2].id,
                        description: JSON.stringify({ eventType: 'credit', source: 'promotion' })
                    }));

                    expect(transactions[1]).toEqual(jasmine.objectContaining({
                        rec_key: jasmine.any(String),
                        rec_ts: jasmine.any(Date),
                        transaction_id: jasmine.any(String),
                        transaction_ts: jasmine.any(Date),
                        org_id: org.id,
                        amount: '13.3300',
                        sign: 1,
                        units: 1,
                        campaign_id: null,
                        braintree_id: null,
                        promotion_id: promotions[0].id,
                        description: JSON.stringify({ eventType: 'credit', source: 'promotion' })
                    }));
                });
            });
        });
    });
});
