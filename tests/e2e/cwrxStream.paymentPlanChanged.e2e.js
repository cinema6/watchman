'use strict';

const Configurator = require('../helpers/Configurator.js');
const ld = require('lodash');
const moment = require('moment');
const rcKinesis = require('rc-kinesis');
const testUtils = require('cwrx/test/e2e/testUtils.js');
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const waitFor = require('../helpers/waiter').waitFor;
const Status = require('cwrx/lib/enums').Status;

const APP_CREDS = JSON.parse(process.env.appCreds);
const API_ROOT = process.env.apiRoot;
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const PREFIX = process.env.appPrefix;
const CWRX_STREAM = process.env.cwrxStream;
const WATCHMAN_STREAM = process.env.watchmanStream;
const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

const request = new CwrxRequest(APP_CREDS);
const cookies = require('request').jar();
const producer = new rcKinesis.JsonProducer(CWRX_STREAM, awsConfig);
const mockman = new testUtils.Mockman({
    streamName: WATCHMAN_STREAM
});

function waitForMockman(eventType, n) {
    var records = [];
    return new Promise(resolve => {
        mockman.on(eventType, function(record) {
            records.push(record);
            if(records.length === n) {
                resolve(records);
            }
        });
    });
}

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
    let advertiser;
    let campaigns;

    function initSystem() {
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
            paymentPlanStart: moment('2016-07-27T00:00:00+00:00').utcOffset(0).format(),
            nextPaymentDate: moment('2016-07-28T00:00:00+00:00').utcOffset(0).format()
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

        advertiser = {
            id: 'adv-e2e',
            name: 'Some Person',
            externalIds: {},
            defaultLinks: {},
            defaultLogos: {}
        };

        campaigns = ld.shuffle([].concat(
            // Our user's campaigns
            Array.apply([], new Array(8)).map((_, index) => ({
                id: `cam-target-${index}`,
                created: moment('2015-08-17').add(index, 'days').utcOffset(0).format(),
                lastUpdated: moment().utcOffset(0).format(),
                status: ld(Status).values().without(Status.Canceled, Status.Deleted).sample(),
                application: 'showcase',
                product: {
                    type: 'app'
                },
                org: org.id,
                user: user.id,
                advertiserId: advertiser.id
            })),
            // Our user's archived campaigns
            Array.apply([], new Array(20)).map((_, index) => ({
                id: `cam-archived-${index}`,
                created: moment('2014-08-17').add(index, 'days').utcOffset(0).format(),
                lastUpdated: moment().utcOffset(0).format(),
                status: Status.Canceled,
                application: 'showcase',
                product: {
                    type: 'app'
                },
                org: org.id,
                user: user.id,
                advertiserId: advertiser.id
            })),
            // Our user's selife campaigns
            Array.apply([], new Array(8)).map((_, index) => ({
                id: `cam-selfie-${index}`,
                created: moment('2015-06-17').add(index, 'days').utcOffset(0).format(),
                lastUpdated: moment().utcOffset(0).format(),
                status: ld(Status).values().without(Status.Canceled, Status.Deleted).sample(),
                application: 'selfie',
                org: org.id,
                user: user.id,
                advertiserId: advertiser.id
            })),
            // Another user's campaigns
            Array.apply([], new Array(8)).map((_, index) => ({
                id: `cam-other-user-${index}`,
                created: moment('2015-08-17').add(index, 'days').utcOffset(0).format(),
                lastUpdated: moment().utcOffset(0).format(),
                status: ld(Status).values().without(Status.Canceled, Status.Deleted).sample(),
                application: 'showcase',
                product: {
                    type: 'app'
                },
                org: 'o-somebody-else',
                user: 'u-somebody-else',
                advertiserId: 'adv-somebody-else'
            }))
        ));

        return Promise.all([
            testUtils.resetCollection('paymentPlans', paymentPlans),
            createPaymentMethod({ org, policy, user }),
            testUtils.resetPGTable('fct.billing_transactions', [cycleToTransaction(cycle)]),
            testUtils.resetCollection('campaigns', campaigns),
            testUtils.resetCollection('advertisers', [advertiser])
        ]);
    }

    function cleanupSystem() {
        return Promise.resolve();
    }

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
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
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
                        },
                        {
                            name: 'showcase/apps/auto_archive_campaigns'
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

    describe('when the user upgrades their plan', () => {
        beforeAll(done => {
            initSystem().then(() => (
                producer.produce({
                    type: '_paymentPlanChanged',
                    data: {
                        org,
                        date: moment('2016-08-12T17:23:11+00:00').utcOffset(0).format(),
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
                )))
            )).then(done, done.fail);
        });

        afterAll(done => {
            cleanupSystem().then(() => (
                Promise.all([
                    testUtils.resetPGTable('fct.billing_transactions', [cycleToTransaction(cycle)])
                ])
            )).then(done, done.fail);
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
                    amount: '476.9600',
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

                expect(moment(transaction.cycle_start).utcOffset(0).format()).toBe(moment('2016-08-12T00:00:00+00:00').utcOffset(0).format());
            }).then(done, done.fail);
        });

        it('should update the org\'s nextPaymentDate', done => {
            request.get({ url: api(`/api/account/orgs/${org.id}`) }).spread(org => {
                expect(org.nextPaymentDate).toBe(moment('2016-09-12T00:00:00Z').utcOffset(0).format());
            }).then(done, done.fail);
        });
    });

    describe('when the user downgrades their plan', () => {
        let targetCampaignIds;
        let otherCampaignIds;

        beforeAll(done => {
            initSystem().then(() => {
                targetCampaignIds = ld(campaigns)
                    .filter({ org: org.id, application: 'showcase' })
                    .filter(campaign => !ld([Status.Canceled, Status.Deleted]).includes(campaign.status))
                    .sortBy('created')
                    .take(5)
                    .map('id')
                    .value();

                otherCampaignIds = ld(campaigns)
                    .filter(campaign => !ld([Status.Canceled, Status.Deleted]).includes(campaign.status))
                    .filter(campaign => !ld(targetCampaignIds).includes(campaign.id))
                    .map('id')
                    .value();

                org.paymentPlanId = paymentPlans[2].id;

                return Promise.resolve().then(() => {
                    return Promise.all([
                        testUtils.resetCollection('orgs', [org]),
                        mockman.start()
                    ]);
                })
                .then(() => {
                    producer.produce({
                        type: '_paymentPlanChanged',
                        data: {
                            org,
                            date: moment().utcOffset(0).format(),
                            currentPaymentPlanId: paymentPlans[2].id,
                            previousPaymentPlanId: paymentPlans[3].id
                        }
                    });

                    return waitForMockman('archivedShowcaseCampaigns', 1);
                });
            }).then(done, done.fail);
        });

        afterAll(done => {
            cleanupSystem().then(() => {
                return Promise.all([
                    mockman.stop()
                ]);
            }).then(done, done.fail);
        });

        it('should archive some of the user\'s oldest campaigns', done => {
            request.get({ url: api('/api/campaigns'), qs: { ids: targetCampaignIds.join(',') } }).spread(campaigns => {
                campaigns.forEach(campaign => expect(campaign.status).toBe(Status.Canceled, `${campaign.id} not archived`));
            }).then(done, done.fail);
        });

        it('should not archive any other campaigns', done => {
            request.get({ url: api('/api/campaigns'), qs: { ids: otherCampaignIds.join(',') } }).spread(campaigns => {
                campaigns.forEach(campaign => expect(campaign.status).not.toBe(Status.Canceled, `${campaign.id} is archived`));
            }).then(done, done.fail);
        });
    });
});
