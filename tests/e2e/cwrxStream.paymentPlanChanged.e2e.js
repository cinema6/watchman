'use strict';

const Configurator = require('../helpers/Configurator.js');
const ld = require('lodash');
const moment = require('moment');
const rcKinesis = require('rc-kinesis');
const testUtils = require('cwrx/test/e2e/testUtils.js');
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const waitFor = require('../helpers/waiter').waitFor;

const APP_CREDS = JSON.parse(process.env.appCreds);
const API_ROOT = process.env.apiRoot;
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const PREFIX = process.env.appPrefix;
const CWRX_STREAM = process.env.cwrxStream;
const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

const request = new CwrxRequest(APP_CREDS);
const cookies = require('request').jar();
const producer = new rcKinesis.JsonProducer(CWRX_STREAM, awsConfig);

function api(endpoint) {
    return resolveURL(API_ROOT, endpoint);
}

function createPaymentMethod(data) {
    const org = data.org;
    const policy = data.policy;
    const user = data.user;

    return Promise.resolve().then(() => {
        return testUtils.resetCollection('orgs', [org]);
    }).then(function makePolicy() {
        return testUtils.resetCollection('policies', [policy]);
    }).then(function makeUser() {
        return testUtils.resetCollection('users', [user]);
    }).then(function login() {
        return request.post({
            url: api('/api/auth/login'),
            json: {
                email: user.email,
                password: 'password'
            },
            jar: cookies
        });
    }).then(function() {
        return request.post({
            url: api('/api/payments/methods'),
            json: {
                paymentMethodNonce: 'fake-valid-visa-nonce',
                makeDefault: true,
                cardholderName: 'Johnny Testmonkey'
            },
            jar: cookies
        });
    });
}

function cycleToTransaction(cycle) {
    return `(
        1,
        current_timestamp,
        '${cycle.id}',
        '${cycle.created}',
        '${cycle.org}',
        ${cycle.amount},
        1,
        1,
        null,
        null,
        null,
        '${cycle.description}',
        ${cycle.targetUsers},
        '${cycle.cycleEnd}',
        '${cycle.cycleStart}',
        '${cycle.paymentPlanId}',
        'showcase'
    )`;
}

describe('cwrxStream paymentPlanChanged', () => {
    let paymentPlans;
    let org;
    let policy;
    let user;
    let cycle;

    // This beforeAll is dedicated to setting application config
    beforeAll(done => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

        const configurator = new Configurator();
        const sharedConfig = {
            secrets: '/opt/sixxy/.watchman.secrets.json',
            appCreds: '/opt/sixxy/.rcAppCreds.json',
            cwrx: {
                api: {
                    root: API_ROOT,
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
                    },
                    transactions: {
                        endpoint: '/api/transactions'
                    },
                    orgs: {
                        endpoint: '/api/account/orgs'
                    },
                    payments: {
                        endpoint: '/api/payments/'
                    }
                }
            },
            emails: {
                sender: 'support@cinema6.com',
                dashboardLinks: {
                    showcase: 'http://localhost:9000/#/showcase/products'
                }
            },
            postmark: {
                templates: {
                    'weekOneStats--app': '736301'
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: {
                // added a leading "_" here so that the paymentPlanChange record produced by
                // the actual org service is not picked-up.
                _paymentPlanChanged: {
                    actions: [
                        {
                            name: 'check_plan_upgrade'
                        }
                    ]
                }
            }
        };
        const timeConfig = {
            eventHandlers: {}
        };
        const watchmanConfig = {
            eventHandlers: {
                paymentRequired: {
                    actions: [
                        {
                            name: 'charge_payment_plan',
                            options: {
                                target: 'showcase'
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

    // Create a mock watchman app
    beforeAll(done => {
        const cwrxApp = {
            id: 'cwrx-app',
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
        const watchmanApp = {
            id: 'watchman-app',
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                users: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                orgs: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                transactions: { read: 'all' }
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
        testUtils.resetCollection('applications', [watchmanApp, cwrxApp]).then(done, done.fail);
    });

    beforeAll(done => {
        paymentPlans = [
            {
                'label': '--canceled--',
                'price': 0,
                'maxCampaigns': 0,
                'viewsPerMonth': 0,
                'status': 'active',
                'id': 'pp-0',
                'created': '2016-07-12T19:05:56.443Z',
                'lastUpdated': '2016-07-12T19:05:56.443Z'
            },
            {
                'label': 'Starter',
                'price': 49.99,
                'maxCampaigns': 1,
                'viewsPerMonth': 2000,
                'status': 'active',
                'id': 'pp-1',
                'created': '2016-07-12T19:06:09.527Z',
                'lastUpdated': '2016-07-12T19:33:39.120Z'
            },
            {
                'label': 'Pro',
                'price': 149.99,
                'maxCampaigns': 3,
                'viewsPerMonth': 7500,
                'status': 'active',
                'id': 'pp-2',
                'created': '2016-07-12T19:06:20.015Z',
                'lastUpdated': '2016-07-12T19:06:20.015Z'
            },
            {
                'label': 'Business',
                'price': 499.99,
                'maxCampaigns': 10,
                'viewsPerMonth': 25500,
                'status': 'active',
                'id': 'pp-3',
                'created': '2016-07-12T19:06:29.782Z',
                'lastUpdated': '2016-07-12T19:06:29.782Z'
            }
        ];

        org = {
            id: 'o-e2e',
            status: 'active',
            name: 'The Best Org',
            paymentPlanId: paymentPlans[3],
            paymentPlanStart: moment('2016-07-27T00:00:00').format(),
            nextPaymentDate: moment('2016-07-28T00:00:00').format()
        };

        policy = {
            id: 'pol-e2e',
            name: 'manageAllOrgs',
            status: 'active',
            priority: 1,
            permissions: {
                orgs: { read: 'all', create: 'all', edit: 'own', delete: 'own' }
            },
            entitlements: {
                makePayment: true
            }
        };

        user = {
            id: 'u-e2e',
            status: 'active',
            firstName: 'Johnny',
            lastName: 'Testmonkey',
            company: 'Bananas 4 Bananas, Inc.',
            email: 'c6e2etester@gmail.com',
            password: '$2a$10$XomlyDak6mGSgrC/g1L7FO.4kMRkj4UturtKSzy6mFeL8QWOBmIWq',
            org: org.id,
            policies: [policy.name]
        };

        cycle = {
            id: 't-cycle',
            created: org.paymentPlanStart,
            org: org.id,
            amount: 50,
            description: JSON.stringify({
                source: 'braintree',
                target: 'showcase'
            }),
            targetUsers: 2000,
            cycleEnd: moment(org.paymentPlanStart).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(),
            cycleStart: org.paymentPlanStart,
            paymentPlanId: paymentPlans[1].id,
            application: 'showcase'
        };

        Promise.all([
            testUtils.resetCollection('paymentPlans', paymentPlans),
            createPaymentMethod({ org, policy, user }),
            testUtils.resetPGTable('fct.billing_transactions', [cycleToTransaction(cycle)])
        ]).then(done, done.fail);
    });

    describe('when the user upgrades their plan', () => {
        beforeAll(done => {
            producer.produce({
                type: '_paymentPlanChanged',
                data: {
                    org,
                    date: moment('2016-08-12T17:23:11').format(),
                    currentPaymentPlanId: paymentPlans[3].id,
                    previousPaymentPlanId: paymentPlans[1].id
                }
            }).then(() => waitFor(() => (
                request.get({
                    url: api(`/api/account/orgs/${org.id}`)
                }).spread(org => (
                    // Updating the org's nextPaymentDate is the last thing watchman will do,
                    // so that's what I'm waiting for.
                    moment(org.nextPaymentDate).isSame(moment('2016-09-12T00:00:00Z').utcOffset(0), 'day')
                ))
            ))).then(done, done.fail);
        });

        afterAll(done => {
            Promise.all([
                testUtils.resetPGTable('fct.billing_transactions', [cycleToTransaction(cycle)])
            ]).then(done, done.fail);
        });

        it('should charge the user a discounted amount of their new plan', done => {
            testUtils.pgQuery(
                'SELECT * FROM fct.billing_transactions WHERE paymentplan_id = $1',
                [paymentPlans[3].id]
            ).then(result => {
                const transaction = result.rows[0];

                expect(transaction).toEqual(jasmine.objectContaining({
                    rec_key: jasmine.any(String),
                    rec_ts: jasmine.any(Date),
                    transaction_id: jasmine.any(String),
                    transaction_ts: jasmine.any(Date),
                    org_id: 'o-e2e',
                    amount: '477.1100',
                    sign: 1,
                    units: 1,
                    campaign_id: null,
                    braintree_id: jasmine.any(String),
                    promotion_id: null,
                    description: '{"eventType":"credit","source":"braintree"}',
                    view_target: 25500,
                    cycle_end: jasmine.any(Date),
                    cycle_start: jasmine.any(Date),
                    paymentplan_id: 'pp-3',
                    application: 'showcase'
                }));

                expect(moment(transaction.cycle_start).utcOffset(0).format()).toBe(moment('2016-08-12T00:00:00Z').utcOffset(0).format());
            }).then(done, done.fail);
        });

        it('should update the org\'s nextPaymentDate', done => {
            request.get({ url: api(`/api/account/orgs/${org.id}`) }).spread(org => {
                expect(org.nextPaymentDate).toBe(moment('2016-09-12T00:00:00Z').utcOffset(0).format());
            }).then(done, done.fail);
        });
    });
});
