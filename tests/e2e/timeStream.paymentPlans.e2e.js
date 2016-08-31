'use strict';

var Configurator = require('../helpers/Configurator.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var Mailman = testUtils.Mailman;
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment');
var waiter = require('../helpers/waiter.js');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var TIME_STREAM = process.env.timeStream;
var PREFIX = process.env.appPrefix;

function createId(prefix) {
    return prefix + '-' + uuid.createUuid();
}

describe('timeStream payment plan billing', function() {
    var producer, request, mailman, cookies;
    var user, org, paymentMethod, paymentPlans, paymentPlan, downgradingOrg;

    var getValidPaymentNonce = (function() {
        var validNonces = [
            'fake-valid-visa-nonce',
            'fake-valid-amex-nonce',
            'fake-valid-mastercard-nonce',
            'fake-valid-discover-nonce',
            'fake-paypal-future-nonce'
        ];

        return function getValidPaymentNonce() {
            return ld.sample(validNonces);
        };
    }());

    var getInvalidPaymentNonce = (function() {
        var invalidNonces = [
            'fake-processor-declined-visa-nonce',
            'fake-processor-declined-mastercard-nonce',
            'fake-processor-declined-amex-nonce',
            'fake-processor-declined-discover-nonce'
        ];

        return function getInvalidPaymentNonce() {
            return ld.sample(invalidNonces);
        };
    }());

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function dailyEvent(time) {
        return producer.produce({
            type: 'hourly',
            data: {
                date: time.format(),
                hour: 12
            }
        });
    }

    function getMail(subject) {
        return new q.Promise(function(resolve, reject) {
            mailman.once(subject, resolve).once('error', reject);
        });
    }

    function getPaymentPlanId() {
        var paymentPlanIds = paymentPlans.slice(0, -1).map(paymentPlan => paymentPlan.id);

        return ld.sample(paymentPlanIds);
    }

    function updatePaymentMethod(nonce) {
        return request.post({
            url: api('/api/payments/methods'),
            json: {
                paymentMethodNonce: nonce,
                makeDefault: true,
                cardholderName: 'Johnny Testmonkey'
            },
            jar: cookies
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

    function updateNextPaymentDate(date) {
        return request.put({
            url: api('/api/account/orgs/' + org.id),
            json: {
                nextPaymentDate: date && date.format()
            }
        }).spread(function(body) { return body; });
    }

    function createUser() {
        var orgId = createId('o');
        var userId = createId('u');
        var policyId = createId('p');
        var downgradingOrgId = createId('o');

        return testUtils.resetCollection('paymentPlans', [
            {
                label: 'Starter',
                price: 49.99,
                maxCampaigns: 1,
                viewsPerMonth: 2000
            },
            {
                label: 'Sub-starter',
                price: 39.99,
                maxCampaigns: 1,
                viewsPerMonth: 1700
            },
            {
                label: 'Low Tier',
                price: 29.99,
                maxCampaigns: 1,
                viewsPerMonth: 1500
            },
            {
                label: 'Value Plan',
                price: 19.99,
                maxCampaigns: 1,
                viewsPerMonth: 1200
            },
            {
                label: 'Cheapskate',
                price: 9.99,
                maxCampaigns: 1,
                viewsPerMonth: 1000
            },
            {
                label: 'MONEY DOLLAZ',
                price: 2499,
                maxCampaigns: 1000,
                viewsPerMonth: 1000000
            }
        ].map(paymentPlan => ld.assign({}, paymentPlan, {
            id: `pp-${uuid.createUuid()}`,
            created: moment().format(),
            lastUpdated: moment().format(),
            status: 'active'
        }))).then(function makeOrg() {
            return request.get({
                url: api('/api/payment-plans'),
                qs: {
                    sort: 'price,1'
                }
            }).then(ld.property(0));
        }).then(function(/*paymentPlans*/) {
            paymentPlans = arguments[0];

            return testUtils.resetCollection('orgs', [{
                id: orgId,
                status: 'active',
                name: 'The Best Org',
                paymentPlanId: getPaymentPlanId(),
                paymentPlanStart: moment().format()
            }, {
                id: downgradingOrgId,
                status: 'active',
                name: 'The Worst Org',
                paymentPlanId: ld.last(paymentPlans).id,
                nextPaymentPlanId: ld.first(paymentPlans).id
            }].concat(Array.apply([], new Array(25)).map(function() {
                var id = uuid.createUuid();

                return {
                    id: id,
                    status: 'active',
                    name: 'The Best Org -- ' + id
                };
            })));
        }).then(function makePolicy() {
            return testUtils.resetCollection('policies', [{
                id: policyId,
                name: 'manageAllOrgs',
                status: 'active',
                priority: 1,
                permissions: {
                    orgs: { read: 'all', create: 'all', edit: 'own', delete: 'own' }
                },
                entitlements: {
                    makePayment: true
                }
            }]);
        }).then(function makeUser() {
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
                jar: cookies
            });
        }).then(function() {
            return updatePaymentMethod(getValidPaymentNonce());
        }).then(function fetchEntities(paymentMethod) {
            return q.all([
                request.get({
                    url: api('/api/account/users/' + userId)
                }).then(ld.property(0)),
                request.get({
                    url: api('/api/account/orgs/' + orgId)
                }).then(ld.property(0)),
                paymentMethod,
                request.get({
                    url: api('/api/account/orgs/' + downgradingOrgId)
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

    function getMostRecentPayment() {
        return waiter.waitFor(function() {
            return getPayments().then(ld.property('0'));
        });
    }

    function getOrg() {
        return request.get({
            url: api('/api/account/orgs/' + org.id),
            json: true
        }).then(ld.property('0'));
    }

    function getPayments() {
        return request.get({
            url: api('/api/payments'),
            jar: cookies
        }).then(ld.property('0'));
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
                    orgs: {
                        endpoint: '/api/account/orgs'
                    },
                    payments: {
                        endpoint: '/api/payments/'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
                    },
                    users: {
                        endpoint: '/api/account/users'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    }
                }
            },
            emails: {
                sender: 'support@cinema6.com'
            },
            postmark: {
                templates: {
                    chargePaymentPlanFailure: '672809'
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: { }
        };
        const timeConfig = {
            eventHandlers: {
                hourly: {
                    actions: [
                        {
                            name: 'fetch_orgs',
                            options: {
                                prefix: 'morning'
                            },
                            ifData: {
                                hour: '^4$'
                            }
                        },
                        {
                            name: 'fetch_orgs',
                            options: {
                                prefix: 'noon'
                            },
                            ifData: {
                                hour: '^12$'
                            }
                        }
                    ]
                }
            }
        };
        const watchmanConfig = {
            eventHandlers: {
                morning_orgPulse: {
                    actions: [
                        {
                            name: 'transition_payment_plans'
                        }
                    ]
                },
                noon_orgPulse: {
                    actions: [
                        {
                            name: 'check_payment_required',
                            ifData: {
                                'org.paymentPlanId': '^pp-'
                            }
                        }
                    ]
                },
                paymentRequired: {
                    actions: [
                        {
                            name: 'charge_payment_plan',
                            options: {
                                target: 'showcase'
                            }
                        }
                    ]
                },
                chargePaymentPlanFailure: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'chargePaymentPlanFailure'
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
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

        producer = new JsonProducer(TIME_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
        mailman = new Mailman();

        q.all([
            mailman.start()
        ]).then(done, done.fail);
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
                transactions: { read: 'all', create: 'all', edit: 'all', delete: 'all' }
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
                    paymentPlanId: { __allowed: true }
                }
            }
        };

        cookies = require('request').jar();

        q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp]),
            testUtils.resetCollection('policies', []),
            testUtils.resetCollection('orgs', []),
            testUtils.resetCollection('users', []),
            testUtils.resetCollection('paymentPlans', []),
            testUtils.resetPGTable('fct.billing_transactions')
        ]).then(function() {
            return createUser();
        }).spread(function(/*user, org, paymentMethod, downgradingOrg*/) {
            user = arguments[0];
            org = arguments[1];
            paymentMethod = arguments[2];
            downgradingOrg = arguments[3];

            paymentPlan = ld.find(paymentPlans, { id: org.paymentPlanId });
        }).then(done, done.fail);

        getInvalidPaymentNonce();
    });

    // Mock relevent Postgres data
    beforeEach(function(done) {
        var transCounter = 9999,
            transFields = ['rec_ts','transaction_id','transaction_ts','org_id','amount','sign',
                           'units','campaign_id','braintree_id','promotion_id','description',
                           'view_target','paymentplan_id','application',
                           'cycle_start','cycle_end'];

        function creditRecordShowcase(org, amount, braintreeId, promotion, desc,
                viewTarget,paymentPlan, app, transTs, cycleStart, cycleEnd ) {
            var recKey = transCounter++,
                id = 't-e2e-' + String(recKey);

            var s =  testUtils.stringifyRecord({
                rec_ts: transTs,
                transaction_id: id,
                transaction_ts: transTs,
                org_id: org,
                amount: amount,
                sign: 1,
                units: 1,
                campaign_id: null,
                braintree_id: braintreeId,
                promotion_id: promotion,
                description: desc,
                view_target : viewTarget,
                paymentplan_id : paymentPlan,
                application: app,
                cycle_start: cycleStart,
                cycle_end: cycleEnd
            }, transFields);
            return s;
        }

        var testTransactions = [
            creditRecordShowcase(downgradingOrg.id, 49.99, 'pay13',null,null,2000,'plan9','showcase',
                    'current_timestamp - \'30 days\'::interval',
                    'current_timestamp - \'30 days\'::interval',
                    'current_timestamp'),
            creditRecordShowcase(downgradingOrg.id, 59.99, 'pay14',null,null,3000,'plan9','showcase',
                    'current_timestamp','current_timestamp',
                    'current_timestamp + \'30 days\'::interval'),
            creditRecordShowcase(downgradingOrg.id, 59.99, 'pay14','promo1',null,400,null,'showcase',
                    'current_timestamp - \'10 days\'::interval'),
            creditRecordShowcase(downgradingOrg.id, 59.99, 'pay14','promo1',null,500,null,'showcase',
                    'current_timestamp + \'10 days\'::interval'),
            creditRecordShowcase(downgradingOrg.id, 59.99, 'pay14','promo1',null,600,null,'showcase',
                    'current_timestamp + \'15 days\'::interval'),
            creditRecordShowcase(downgradingOrg.id, 59.99, 'pay14','promo1',null,500,null,'showcase',
                    'current_timestamp + \'10 days\'::interval')
        ];

        testUtils.resetPGTable('fct.billing_transactions', testTransactions, null, transFields).then(done, done.fail);
    });

    afterEach(function(done) {
        mailman.removeAllListeners();

        q.all([
            deleteUser(user)
        ]).then(done, done.fail);
    });

    afterAll(function(done) {
        q.all([
            mailman.stop()
        ]).then(done, done.fail);
    });

    describe('if the org has a nextPaymentDate', function() {
        var today, payments, payment, transaction;

        beforeEach(function() {
            today = moment();
        });

        describe('that is after today', function() {
            beforeEach(function(done) {
                updateNextPaymentDate(moment(today).add(1, 'day')).then(function(/*org*/) {
                    org = arguments[0];

                    return dailyEvent(today);
                }).then(function() {
                    return waiter.delay(10000);
                }).then(function() {
                    return getPayments();
                }).then(function(/*payments*/) {
                    payments = arguments[0];

                    return getOrg();
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            it('should not make a payment', function() {
                expect(payments.length).not.toBeGreaterThan(0, 'A payment was made.');
            });

            it('should not update the org\'s nextPaymentDate', function() {
                expect(org.nextPaymentDate).toBe(moment(today).add(1, 'day').format(), 'Org\'s nextPaymentDate was updated.');
            });
        });

        describe('that is today', function() {
            beforeEach(function(done) {
                updateNextPaymentDate(moment(today)).then(function(/*org*/) {
                    org = arguments[0];

                    return dailyEvent(today);
                }).then(function() {
                    return getMostRecentPayment();
                }).then(function(/*payment*/) {
                    payment = arguments[0];
                }).then(function() {
                    return waiter.waitFor(function() {
                        return testUtils.pgQuery(
                            'SELECT * FROM fct.billing_transactions WHERE org_id = $1 ORDER BY rec_ts DESC LIMIT 1',
                            [org.id]
                        ).then(function(result) {
                            return result.rows.length > 0 && result;
                        });
                    });
                }).then(function(result) {
                    transaction = result.rows[0];

                    return waiter.waitFor(function() {
                        return getOrg().then(function(updatedOrg) {
                            return updatedOrg.nextPaymentDate !== org.nextPaymentDate && updatedOrg;
                        });
                    });
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            it('should make a payment for the amount of the payment plan', function() {
                expect(payment.amount).toBe(paymentPlan.price);
                expect(payment.method.token).toBe(paymentMethod.token);

                expect(transaction).toEqual(jasmine.objectContaining({
                    application: 'showcase',
                    paymentplan_id: paymentPlan.id,
                    view_target: paymentPlan.viewsPerMonth
                }));
                expect(moment(transaction.cycle_start).utcOffset(0).format()).toEqual(moment(today).utcOffset(0).startOf('day').format(), 'cycle_start is wrong');
                expect(moment(transaction.cycle_end).utcOffset(0).format()).toEqual(moment(today).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(), 'cycle_end is wrong');
            });

            it('should update the org\'s nextPaymentDate', function() {
                expect(moment(org.nextPaymentDate).utcOffset(0).format()).toBe(moment(today).utcOffset(0).startOf('day').add(1, 'month').format());
            });
        });

        describe('that is before today', function() {
            beforeEach(function(done) {
                updateNextPaymentDate(moment(today).subtract(1, 'day')).then(function(/*org*/) {
                    org = arguments[0];

                    return dailyEvent(today);
                }).then(function() {
                    return getMostRecentPayment();
                }).then(function(/*payment*/) {
                    payment = arguments[0];
                }).then(function() {
                    return waiter.waitFor(function() {
                        return testUtils.pgQuery(
                            'SELECT * FROM fct.billing_transactions WHERE org_id = $1 ORDER BY rec_ts DESC LIMIT 1',
                            [org.id]
                        ).then(function(result) {
                            return result.rows.length > 0 && result;
                        });
                    });
                }).then(function(result) {
                    transaction = result.rows[0];
                    return waiter.waitFor(function() {
                        return getOrg().then(function(updatedOrg) {
                            return updatedOrg.nextPaymentDate !== org.nextPaymentDate && updatedOrg;
                        });
                    });
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            it('should make a payment for the amount of the payment plan', function() {
                expect(transaction).toEqual(jasmine.objectContaining({
                    application: 'showcase',
                    paymentplan_id: paymentPlan.id,
                    view_target: paymentPlan.viewsPerMonth
                }));
                expect(moment(transaction.cycle_start).utcOffset(0).format()).toEqual(moment(today).utcOffset(0).startOf('day').format(), 'cycle_start is wrong');
                expect(moment(transaction.cycle_end).utcOffset(0).format()).toEqual(moment(today).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(), 'cycle_end is wrong');
            });

            it('should update the org\'s nextPaymentDate', function() {
                expect(moment(org.nextPaymentDate).utcOffset(0).format()).toBe(moment(today).utcOffset(0).startOf('day').add(1, 'month').format());
            });
        });

        describe('and the org has no nextPaymentDate', function() {
            var payments;

            beforeEach(function(done) {
                updateNextPaymentDate(null).then(function() {
                    return dailyEvent(moment().add(3, 'hours'));
                }).then(function() {
                    return waiter.delay(5000);
                }).then(function() {
                    return getPayments();
                }).then(function(/*payments*/) {
                    payments = arguments[0];

                    return getOrg();
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            it('should not make a payment', function() {
                expect(payments.length).not.toBeGreaterThan(0, 'A payment was made.');
            });

            it('should not give the org a nextPaymentDate', function() {
                expect(org.nextPaymentDate).not.toBeTruthy();
            });
        });

        describe('if the user\'s card is declined', function() {
            var email;

            beforeEach(function(done) {
                var invalidPlan = paymentPlans.slice(-1)[0]; // Get the last payment plan, whose amount will cause a failure.

                getMail('We Hit a Snag').then(function(/*email*/) {
                    email = arguments[0];
                }).then(done, done.fail);

                updatePaymentPlan(invalidPlan.id).then(function() {
                    return updateNextPaymentDate(moment());
                }).then(function(/*org*/) {
                    org = arguments[0];
                    paymentPlan = invalidPlan;

                    return dailyEvent(moment().add(3, 'hours'));
                }).catch(done.fail);
            });

            it('should send the user an email', function() {
                expect(email.text).toContain('PLEASE CHECK YOUR PAYMENT METHOD');
                expect(email.from[0].address.toLowerCase()).toBe('support@cinema6.com');
                expect(email.to[0].address.toLowerCase()).toBe(user.email);
                expect(moment(email.date).isAfter(moment().subtract(1, 'minute'))).toBe(true, 'Email is too old.');
            });
        });
    });

    it('should be able to transition to a pending next payment plan', function (done) {
        producer.produce({
            type: 'hourly',
            data: {
                date: moment().add(2, 'months').toDate(),
                hour: '4'
            }
        }).then(() => {
            return waiter.waitFor(() => {
                return request.get({
                    url: api(`/api/account/orgs/${downgradingOrg.id}`)
                }).then(ld.spread(org => {
                    return !org.nextPaymentPlanId && org;
                }));
            });
        }).then(org => {
            expect(org.paymentPlanId).toEqual(ld.first(paymentPlans).id);
            expect(org.nextPaymentPlanId).toBeNull();
        }).then(done, done.fail);
    });
});
