'use strict';

var Configurator = require('../helpers/Configurator.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment-timezone');
var Status = require('cwrx/lib/enums').Status;
var BeeswaxHelper = require('../helpers/BeeswaxHelper');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var PREFIX = process.env.appPrefix;

function toBeeswaxDate(dt){
    return moment(dt).tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');
}

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

describe('cwrxStream transactionCreated', function() {
    let sharedConfig, cwrxConfig, timeConfig, watchmanConfig;
    var producer, request, beeswax, cookies;
    var advertiser, campaigns, beeswaxCampaigns, org, paymentPlan, user, policy,
        targetCampaignIds, otherCampaignIds, ourCampaignIds;
    var targetOrg, transaction;

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function createAdvertiser() {
        return beeswax.createAdvertiser()
        .then(function(result){
            return request.post({
                url: api('/api/account/advertisers'),
                json: {
                    name: result.advertiser_name,
                    externalIds : {
                        beeswax : result.advertiser_id
                    },
                    defaultLinks: {},
                    defaultLogos: {}
                }
            }).then(ld.property(0));
        });
    }

    function setupCampaign(campaign) {
        return beeswax.api.campaigns.create({
            advertiser_id: advertiser.externalIds.beeswax,
            campaign_name: `E2E Test Campaign (${uuid.createUuid()})`,
            campaign_budget: 750,
            budget_type: 1,
            start_date : toBeeswaxDate(
                (new Date()).toISOString().substr(0,10) + 'T00:00:00Z'),
            pacing: 0,
            active: true
        }).then(response => {
            const beeswaxCampaign = response.payload;

            return request.put({
                url: api('/api/campaigns/' + campaign.id),
                json: {
                    externalIds: {
                        beeswax: response.payload.campaign_id
                    }
                }
            }).spread(campaign => [campaign, beeswaxCampaign]);
        })
        .spread((campaign,beeswaxCampaign) => {
            return beeswax.createMRAIDCreative({
                advertiser_id : advertiser.externalIds.beeswax
            })
            .then(creative => request.post({
                url : api('/api/placements'),
                json : {
                    label : 'Showcase Interstitial: ' + creative.creative_id,
                    tagType : 'mraid',
                    tagParams : {
                        type: 'mobile-card',
                        container : 'beeswax',
                        campaign : campaign.id
                    },
                    externalIds : {
                        beeswax : creative.creative_id
                    }
                }
            }))
            .then(() => [ campaign, beeswaxCampaign ] );
        });
    }

    function transactionCreatedEvent(time) {
        return producer.produce({
            type: 'transactionCreated',
            data: {
                transaction: transaction,
                date: (time || moment()).format()
            }
        });
    }

    const createPaymentMethod = (() => {
        const nonces = [
            'fake-valid-visa-nonce',
            'fake-valid-amex-nonce',
            'fake-valid-mastercard-nonce',
            'fake-valid-discover-nonce',
            'fake-paypal-future-nonce'
        ];
        let nonceIndex = -1;

        return function createPaymentMethod(data) {
            const user = data.user;
            const nonce = nonces[++nonceIndex] || nonces[nonceIndex = 0];

            return Promise.resolve().then(() => {
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
                        paymentMethodNonce: nonce,
                        makeDefault: true,
                        cardholderName: 'Johnny Testmonkey'
                    },
                    jar: cookies
                }).spread(paymentMethod => paymentMethod);
            });
        };
    })();

    function createPayment(data) {
        const user = data.user;
        const paymentMethod = data.paymentMethod;
        const paymentPlan = data.paymentPlan;

        return Promise.resolve().then(() => {
            return request.post({
                url: api('/api/payments'),
                qs: {
                    org: user.org,
                    target: 'showcase'
                },
                json: {
                    paymentMethod: paymentMethod.token,
                    amount: paymentPlan.price,
                    transaction: {
                        application: 'showcase',
                        paymentPlanId: paymentPlan.id,
                        targetUsers: paymentPlan.viewsPerMonth,
                        cycleStart: moment().utcOffset(0).startOf('day').format(),
                        cycleEnd: moment().utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format()
                    }
                }
            }).spread(payment => payment);
        });
    }

    function initSystem() {
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
                advertisers: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                placements: { read: 'all', create: 'all' },
                promotions: { read: 'all' },
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
                    },
                    pricing: {
                        budget: {
                            __min: 0,
                            __max: Infinity
                        },
                        cost: {
                            __allowed: true
                        },
                        dailyLimit: {
                            __min: 0,
                            __max: Infinity
                        }
                    }
                },
                orgs: {
                    paymentPlanStart: { __allowed: true },
                    paymentPlanId: { __allowed: true },
                    promotions: { __allowed: true }
                }
            }
        };

        paymentPlan = {
            id: 'pp-0Ek5Na02vCohpPgw',
            label: 'Pro',
            price: 149.99,
            maxCampaigns: 5,
            viewsPerMonth: 7500,
            created: '2016-07-05T14:18:29.642Z',
            lastUpdated: '2016-07-05T14:28:57.336Z',
            status: 'active'
        };

        org = {
            id: createId('o'),
            status: 'active',
            name: 'The Best Org',
            paymentPlanId: paymentPlan.id,
            paymentPlanStart: moment().format()
        };

        user = {
            id: createId('u'),
            status: 'active',
            firstName: 'Johnny',
            lastName: 'Testmonkey',
            company: 'Bananas 4 Bananas, Inc.',
            email: 'c6e2etester@gmail.com',
            password: '$2a$10$XomlyDak6mGSgrC/g1L7FO.4kMRkj4UturtKSzy6mFeL8QWOBmIWq',
            org: org.id,
            policies: ['manageAllOrgs']
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

        return q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp]),
            testUtils.resetCollection('paymentPlans', [paymentPlan]),
            testUtils.resetCollection('orgs', [org]),
            testUtils.resetCollection('users', [user]),
            testUtils.resetCollection('policies', [policy])
        ]).then(function() {
            return createAdvertiser();
        }).then(function(/*advertiser*/) {
            advertiser = arguments[0];
            targetOrg = org.id;

            targetCampaignIds = [createId('cam'), createId('cam')];
            campaigns = [
                // Another org's selfie campaign
                {
                    id: createId('cam'),
                    application: 'selfie',
                    status: Status.Paused,
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.06,
                        budget: 250,
                        dailyLimit: 50
                    },
                    org: createId('o'),
                    advertiserId: advertiser.id
                },
                // Another org's showcase campaign
                {
                    id: createId('cam'),
                    status: Status.Active,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 33,
                        dailyLimit: 2
                    },
                    org: createId('o'),
                    advertiserId: advertiser.id,
                    product: {
                        type: 'app'
                    }
                },
                // Our org's showcase campaign
                {
                    id: targetCampaignIds[0],
                    status: Status.Active,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 3.50,
                        dailyLimit: 2
                    },
                    org: targetOrg,
                    advertiserId: advertiser.id,
                    product: {
                        type: 'app'
                    },
                    conversionMultipliers: {
                        internal: 1.5,
                        external: 2
                    }
                },
                // Another org's selfie campaign
                {
                    id: createId('cam'),
                    status: Status.Rejected,
                    application: 'selfie',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.06,
                        budget: 1000,
                        dailyLimit: 100
                    },
                    org: createId('o'),
                    advertiserId: advertiser.id
                },
                // Our org's showcase campaign
                {
                    id: targetCampaignIds[1],
                    status: Status.Active,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 1.25,
                        dailyLimit: 1
                    },
                    org: targetOrg,
                    advertiserId: advertiser.id,
                    product: {
                        type: 'app'
                    }
                },
                // Our org's showcase (non-app) campaign
                {
                    id: createId('cam'),
                    status: Status.Active,
                    application: 'showcase',
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    pricing: {
                        model: 'cpv',
                        cost: 0.01,
                        budget: 1.25,
                        dailyLimit: 1
                    },
                    org: targetOrg,
                    advertiserId: advertiser.id,
                    product: {
                        type: 'ecommerce'
                    }
                }
            ].map(function(campaign) {
                return ld.assign({}, campaign, {
                    name: 'My Awesome Campaign (' + uuid.createUuid() + ')'
                });
            });
            otherCampaignIds = campaigns.map(function(campaign) { return campaign.id; })
                .filter(function(id) { return targetCampaignIds.indexOf(id) < 0; });
            ourCampaignIds = campaigns.filter(function(campaign) {
                return campaign.org === targetOrg;
            }).map(function(campaign) {
                return campaign.id;
            });

            return testUtils.resetCollection('campaigns', campaigns);
        }).then(function() {
            return q.all(campaigns.map(function(campaign) {
                return setupCampaign(campaign);
            }));
        }).then(function(campaignSets) {
            campaigns = campaignSets.map(set => set[0]);
            beeswaxCampaigns = campaignSets.map(set => set[1]);

            campaigns = campaigns.map(function(campaign) {
                var isOurs = ourCampaignIds.indexOf(campaign.id) > -1;

                return ld.assign({}, campaign, {
                    created: moment().subtract(1, 'year').toDate(),
                    lastUpdated: moment().subtract(1, 'month').toDate(),
                    org: isOurs ? targetOrg : campaign.org
                });
            });

            return testUtils.resetCollection('campaigns', campaigns);
        });
    }

    function cleanupSystem() {
        return beeswax.cleanupAdvertiser(advertiser.externalIds.beeswax);
    }

    // This beforeAll is dedicated to setting application config
    beforeAll(function(done) {
        const configurator = new Configurator();
        sharedConfig = {
            secrets: '/opt/sixxy/.watchman.secrets.json',
            appCreds: '/opt/sixxy/.rcAppCreds.json',
            cwrx: {
                api: {
                    root: API_ROOT,
                    tracking : 'https://audit.cinema6.com/pixel.gif',
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    placements: {
                        endpoint: '/api/placements'
                    },
                    advertisers: {
                        endpoint: '/api/account/advertisers'
                    },
                    orgs: {
                        endpoint: '/api/account/orgs'
                    },
                    payments: {
                        endpoint: '/api/payments/'
                    },
                    promotions: {
                        endpoint: '/api/promotions'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
                    },
                    transactions: {
                        endpoint: '/api/transactions'
                    }
                }
            },
            //beeswax : {
            //    templates : {
            //        targeting : {
            //            mobile_app: [ {
            //                exclude: { app_bundle_list: [ 7031 ] }
            //            }]
            //        }
            //    }
            //},
            campaign: {
                conversionMultipliers: {
                    internal: 1.1,
                    external: 1.25
                }
            },
            emails: {
                sender: 'support@cinema6.com'
            },
            postmark: {
                templates: {
                }
            }
        };
        cwrxConfig = {
            eventHandlers: {
                transactionCreated: {
                    actions: [
                        {
                            name: 'showcase/apps/auto_increase_budget',
                            options: {
                                dailyLimit: 2,
                                externalAllocationFactor: 0.5
                            },
                            ifData: {
                                'transaction.sign': '^1$',
                                'transaction.application': '^showcase$',
                                'transaction.paymentPlanId': '^pp-'
                            }
                        },
                        {
                            name: 'showcase/apps/rebalance',
                            ifData: {
                                'transaction.sign': '^1$',
                                'transaction.application': '^showcase$',
                                'transaction.paymentPlanId': '^(null|undefined)$'
                            }
                        }
                    ]
                }
            }
        };
        timeConfig = {
            eventHandlers: { }
        };
        watchmanConfig = {
            eventHandlers: {
                increasedCampaignBudgets: {
                    actions: [
                        {
                            name: 'fulfill_bonus_views',
                            options: {
                                target: 'showcase'
                            }
                        }
                    ]
                },
                promotionFulfilled: {
                    actions: [
                        {
                            name: 'create_promotion_credit'
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

    beforeAll(function() {
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
        beeswax = new BeeswaxHelper();
        cookies = require('request').jar();
    });

    describe('if the org has a bonus view promotion', () => {
        let promotion;

        beforeAll(done => {
            initSystem().then(() => {
                promotion = {
                    id: createId('pro'),
                    status: 'active',
                    created: moment().subtract(6, 'months').format(),
                    lastUpdated: moment().subtract(6, 'months').format(),
                    name: 'Free Trial',
                    type: 'freeTrial',
                    data: {
                        [paymentPlan.id]: {
                            paymentMethodRequired: true,
                            targetUsers: 1000,
                            trialLength: null
                        }
                    }
                };
                org.promotions = [
                    {
                        id: promotion.id,
                        created: moment().format(),
                        lastUpdated: moment().format(),
                        status: 'active'
                    }
                ];

                return Promise.resolve().then(() =>{
                    return Promise.all([
                        testUtils.resetCollection('promotions', [promotion]),
                        testUtils.resetCollection('orgs', [org]),
                        testUtils.resetPGTable('fct.billing_transactions')
                    ]);
                }).then(() => {
                    return createPaymentMethod({ user });
                }).then(paymentMethod => {
                    return createPayment({ user, paymentMethod, paymentPlan });
                }).then(() => waitUntil(() => {
                    return Promise.resolve().then(() => {
                        return request.get({
                            url: api('/api/campaigns'),
                            qs: { ids: targetCampaignIds.join(',') }
                        }).spread(campaigns => campaigns);
                    }).then(campaigns => {
                        // Every campaign needs to have a beeswax campaign.
                        if (campaigns.some(campaign => !ld.get(campaign, 'externalIds.beeswax'))) {
                            return false;
                        }

                        return Promise.all(campaigns.map(
                            campaign => beeswax.api.lineItems.query({
                                campaign_id : campaign.externalIds.beeswax
                            }).then(response => {
                                const lineItem = response.payload && response.payload[0];

                                // Wait until line items' budgets have been increased a second time.
                                return lineItem && (lineItem.line_item_budget > (3750 * ld.get(campaign, 'conversionMultipliers.external', 1.25)));
                            })
                        )).then(results => results.every(result => result));
                    });
                }));
            }).then(done, done.fail);
        });

        afterAll(done => {
            cleanupSystem().then(() => {

            }).then(done, done.fail);
        });

        it('should create a transaction for the bonus views', done => {
            testUtils.pgQuery(
                'SELECT * FROM fct.billing_transactions WHERE org_id = $1 AND paymentplan_id IS NULL',
                [org.id]
            )
            .then(result => {
                const transaction = result.rows[0];

                expect(transaction).toEqual(jasmine.objectContaining({
                    rec_key: jasmine.any(String),
                    rec_ts: jasmine.any(Date),
                    transaction_id: jasmine.any(String),
                    transaction_ts: jasmine.any(Date),
                    org_id: org.id,
                    amount: '20.0000',
                    sign: 1,
                    units: 1,
                    campaign_id: null,
                    braintree_id: null,
                    promotion_id: promotion.id,
                    description: '{"eventType":"credit","source":"promotion"}',
                    view_target: 1000,
                    cycle_end: null,
                    cycle_start: null,
                    paymentplan_id: null,
                    application: 'showcase'
                }));
            })
            .then(done, done.fail);
        });

        it('should set the pricing hash of every showcase campaign', done => {
            Promise.all(targetCampaignIds.map(id => (
                request.get({ url: api(`/api/campaigns/${id}`) }).spread(campaign => campaign)
            )))
            .then(campaigns => targetCampaignIds.map(id => ld.find(campaigns, { id })))
            .then(campaigns => {
                expect(campaigns[0].pricing).toEqual({
                    model: 'cpv',
                    cost: 0.013,
                    budget: 87.32,
                    dailyLimit: 2
                });

                expect(campaigns[1].pricing).toEqual({
                    model: 'cpv',
                    cost: 0.018,
                    budget: 85.07,
                    dailyLimit: 2
                });
            })
            .then(done, done.fail);
        });

        it('should set the impressions of the beeswax campaigns', done => {
            Promise.all(targetCampaignIds.map(id => (
                request.get({ url: api(`/api/campaigns/${id}`) }).spread(campaign => campaign)
            )))
            .then(campaigns => targetCampaignIds.map(id => ld.find(campaigns, { id })))
            .then(campaigns => Promise.all(campaigns.map(campaign => (
                beeswax.api.campaigns.find(campaign.externalIds.beeswax).then(response => response.payload)
            ))))
            .then(beeswaxCampaigns => {
                expect(beeswaxCampaigns[0].campaign_budget).toBe(9250);
                expect(beeswaxCampaigns[1].campaign_budget).toBe(6062.5);
            })
            .then(done, done.fail);
        });

        it('should set the impressions of the beeswax line items', done => {
            Promise.all(targetCampaignIds.map(id => (
                request.get({ url: api(`/api/campaigns/${id}`) }).spread(campaign => campaign)
            )))
            .then(campaigns => targetCampaignIds.map(id => ld.find(campaigns, { id })))
            .then(campaigns => Promise.all(campaigns.map(campaign => (
                beeswax.api.lineItems.query({ campaign_id: campaign.externalIds.beeswax }).then(response => response.payload[0])
            ))))
            .then(beeswaxLineItems => {
                expect(beeswaxLineItems[0].line_item_budget).toBe(8500);
                expect(beeswaxLineItems[1].line_item_budget).toBe(5313);
            })
            .then(done, done.fail);
        });
    });

    describe('when produced', function() {
        var updatedCampaigns, updatedBeeswaxCampaigns, updatedBeeswaxLineItems;

        beforeAll(function(done) {
            initSystem().then(() => {
                transaction = {
                    id: createId('t'),
                    created: new Date().toISOString(),
                    transactionTS: new Date().toISOString(),
                    amount: 50,
                    sign: 1,
                    units: 1,
                    org: targetOrg,
                    campaign: null,
                    braintreeId: null,
                    promotion: createId('pro'),
                    application: 'showcase',
                    paymentPlanId: 'pp-0Ek5Na02vCohpPgw',
                    targetUsers: 2000,
                    cycleStart: moment().format(),
                    cycleEnd: moment().add(1, 'month').subtract(1, 'day').format()
                };

                return transactionCreatedEvent().then(function() {
                    return waitUntil(() => Promise.all([
                        Promise.all(targetCampaignIds.map(id => (
                            request.get({
                                url: api('/api/campaigns/' + id),
                                json: true
                            }).spread(campaign => (
                                (
                                    moment(campaign.lastUpdated).isAfter(
                                        moment().subtract(1, 'day'))
                                ) && campaign
                            ))
                        )))
                        .then(campaigns => 
                            campaigns.every(campaign => !!campaign) && campaigns
                        ),
                        Promise.all(targetCampaignIds.map(id => {
                            const campaign = ld.find(campaigns, { id });

                            return beeswax.api.campaigns.find(campaign.externalIds.beeswax)
                                .then(response => {
                                    const beeswaxCampaign = response.payload;
                                    const oldBeeswaxCampaign = ld.find(
                                        beeswaxCampaigns, 
                                        { campaign_id: beeswaxCampaign.campaign_id }
                                    );

                                    return (
                                        beeswaxCampaign.campaign_budget !==
                                            oldBeeswaxCampaign.campaign_budget
                                    ) && beeswaxCampaign;
                                });
                        }))
                        .then(beeswaxCampaigns => 
                            beeswaxCampaigns.every(beeswaxCampaign => !!beeswaxCampaign)
                                && beeswaxCampaigns
                        ),
                        Promise.all(targetCampaignIds.map(id => {
                            const campaign = ld.find(campaigns, { id });

                            return beeswax.api.lineItems.query({
                                campaign_id : campaign.externalIds.beeswax
                            })
                            .then(response => {
                                return response.payload;
                            });
                        }))
                        .then(beeswaxLineItems => 
                            beeswaxLineItems.every(
                                item => (!!item && (item.length === 1) && item[0].active)
                            ) && (beeswaxLineItems.length === 2 ) && beeswaxLineItems
                        )
                    ]).then(items => items.every(item => !!item) && items)
                    ).spread(function(/*updatedCampaigns, updatedBeeswaxCampaigns*/) {
                        updatedCampaigns = arguments[0];
                        updatedBeeswaxCampaigns = arguments[1];
                        updatedBeeswaxLineItems = arguments[2];
                    });
                });
            }).then(done, done.fail);
        });

        afterAll(done => {
            cleanupSystem().then(done, done.fail);
        });

        it('should update each showcase campaign for the org', function() {
            expect(updatedCampaigns.length).toBe(targetCampaignIds.length);
            updatedCampaigns.forEach(function(campaign) {
                expect(moment(campaign.lastUpdated).isBefore(moment().subtract(1, 'week'))).toBe(false, 'campaign(' + campaign.id + ') was not updated recently!');
            });
        });

        it('should set the pricing hash of every showcase campaign', function() {
            expect(updatedCampaigns[0].pricing).toEqual({
                model: 'cpv',
                cost: 0.017,
                budget: 28.5,
                dailyLimit: 2
            });

            expect(updatedCampaigns[1].pricing).toEqual({
                model: 'cpv',
                cost: 0.023,
                budget: 26.25,
                dailyLimit: 2
            });
        });

        it('should set each campaign\'s dailyLimit', function() {
            updatedCampaigns.forEach(function(campaign) {
                expect(campaign.pricing.dailyLimit).toBe(2);
            });
        });

        it('should increase the impressions of every beeswax campaign', function() {
            expect(updatedBeeswaxCampaigns[0].campaign_budget).toBe(2750);
            expect(updatedBeeswaxCampaigns[1].campaign_budget).toBe(2000);

            expect(updatedBeeswaxLineItems[0][0].line_item_budget).toBe(2000);
            expect(updatedBeeswaxLineItems[1][0].line_item_budget).toBe(1250);
        });

        it('should set every showcase campaign\'s status to active', function() {
            updatedCampaigns.forEach(function(campaign) {
                expect(campaign.status).toBe(Status.Active);
            });
        });

        it('should not update any other campaigns', function(done) {
            q.all(otherCampaignIds.map(function(id) {
                return request.get({
                    url: api('/api/campaigns/' + id),
                    json: true
                }).spread(function(campaign) {
                    expect(moment(campaign.lastUpdated).isBefore(moment().subtract(1, 'week'))).toBe(true, 'campaign(' + campaign.id + ') was updated recently!');
                });
            })).then(done, done.fail);
        });
    });
});
