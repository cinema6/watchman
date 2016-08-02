'use strict';

const Configurator = require('../helpers/Configurator.js');
const JsonProducer = require('rc-kinesis').JsonProducer;
const q = require('q');
const ld = require('lodash');
const uuid = require('rc-uuid');
const moment = require('moment-timezone');
const BeeswaxHelper = require('../helpers/BeeswaxHelper');
const testUtils = require('cwrx/test/e2e/testUtils');
const resolveURL = require('url').resolve;
const CwrxRequest = require('../../lib/CwrxRequest');

const API_ROOT = process.env.apiRoot;
const APP_CREDS = JSON.parse(process.env.appCreds);
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const CWRX_STREAM = process.env.cwrxStream;
const PREFIX = process.env.appPrefix;

function createId(prefix) {
    return `${prefix}-${uuid.createUuid()}`;
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

function api(endpoint) {
    return resolveURL(API_ROOT, endpoint);
}

/*function wait(time) {
    return waitUntil(function() { return q.delay(time).thenResolve(true); });
}*/

describe('cwrxStream campaignStateChange', function() {
    let producer, beeswax, request, user, org, advertiser, cycleStart, cycleEnd ;
    
    function produce(campaign) {
        return producer.produce({
            type: 'campaignStateChange',
            data: {
                campaign,
                date: moment().format(),
                previousState: 'active',
                currentState: campaign.status
            }
        });
    }

    function createUser() {
        var orgId = createId('o');
        var userId = createId('u');
        var paymentPlanId = createId('pp');

        return testUtils.resetCollection('paymentPlans', [{
            id: paymentPlanId,
            label: 'Starter',
            price: 39.99,
            maxCampaigns: 1,
            viewsPerMonth: 2000,
            created: '2016-07-05T14:18:29.642Z',
            lastUpdated: '2016-07-05T14:28:57.336Z',
            status: 'active'
        }]).then(function makeOrg() {
            return testUtils.resetCollection('orgs', [{
                id: orgId,
                status: 'active',
                name: 'The Best Org',
                paymentPlanId: paymentPlanId,
                paymentPlanStart: moment().format()
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
                jar: true
            });
        }).then(function makeAdvertiser() {
            return request.post({
                url: api('/api/account/advertisers'),
                json: {
                    name: 'e2e-advertiser--' + uuid.createUuid(),
                    defaultLinks: {},
                    defaultLogos: {}
                },
                jar: true
            }).then(ld.property(0));
        }).then(function fetchEntities() {
            return q.all([
                request.get({
                    url: api('/api/account/users/' + userId)
                }).then(ld.property(0)),
                request.get({
                    url: api('/api/account/orgs/' + orgId)
                }).then(ld.property(0)),
                request.get({
                    url: api('/api/account/advertisers?org=' + orgId)
                }).then(ld.property('0.0')),
                request.get({
                    url: api(`/api/payment-plans/${paymentPlanId}`)
                }).then(ld.property('0'))
            ]);
        });
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
            emails: {
                sender: 'support@cinema6.com'
            },
            postmark: {
                templates: {
                }
            },
            campaign: {
                conversionMultipliers: {
                    internal: 1.1,
                    external: 1.25
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: {
                campaignStateChange: {
                    actions: [
                        {
                            name: 'showcase/apps/clean_up_campaign',
                            options: {},
                            ifData: {
                                currentState: 'canceled',
                                'campaign.application': '^showcase$',
                                'campaign.product.type': '^app$'
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
            eventHandlers: { }
        };
        Promise.all([
            configurator.updateConfig(`${PREFIX}CwrxStreamApplication`, sharedConfig, cwrxConfig),
            configurator.updateConfig(`${PREFIX}TimeStreamApplication`, sharedConfig, timeConfig),
            configurator.updateConfig(`${PREFIX}WatchmanStreamApplication`, sharedConfig, watchmanConfig)
        ]).then(done, done.fail);
    });

    beforeAll(function() {
        const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        beeswax = new BeeswaxHelper();
        request = new CwrxRequest(APP_CREDS);
    });
    
    beforeAll(function(done) {
        Promise.all([
            testUtils.pgQuery('DELETE FROM fct.billing_transactions'),
            testUtils.pgQuery('DELETE FROM fct.showcase_user_views_daily')
        ]).then(done, done.fail);
    });

    beforeAll(function(done) {
        const cwrxApp = {
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
        const watchmanApp = {
            id: createId('app'),
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                users: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                orgs: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                placements: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                advertisers: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                promotions: { read: 'all' },
                transactions: { read: 'all', create: 'all' },
                paymentPlans: { read: 'all' }
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
                    cards: {
                        __length: Infinity
                    },
                    pricing: {
                        budget: {
                            __min: 0
                        }
                    }
                },
                orgs: {
                    paymentPlanStart: { __allowed: true },
                    paymentPlanId: { __allowed: true },
                    promotions: { __allowed: true }
                },
                cards: {
                    user: {
                        __allowed: true
                    },
                    org: {
                        __allowed: true
                    }
                }
            }
        };

        testUtils.resetCollection('applications', [watchmanApp, cwrxApp])
        .then(done, done.fail);
    });

    beforeAll(function(done){
        createUser()
        .then(ld.spread(function(){
            user        = arguments[0];
            org         = arguments[1];
            advertiser  = arguments[2];
        }))
        .then(done, done.fail);
    });
    
    beforeAll(function(done){
        cycleStart = moment().format('YYYY-MM-DDT00:00:00') + 'Z';
        cycleEnd = moment().add(1,'month').subtract(1,'day')
            .format('YYYY-MM-DDT23:59:59') + 'Z';

        testUtils.resetPGTable('fct.billing_transactions',[
            `(
                1,
                current_timestamp,
                't-1',
                current_timestamp,
                '${org.id}',
                50,
                1,
                1,
                null,
                'braintree1',
                null,
                'description',
                2000,
                '${cycleEnd}',
                '${cycleStart}',
                'pp-${uuid.createUuid()}',
                'showcase'
            )`
        ])
        .then(done,done.fail);
    });

    afterAll(function(done){
        beeswax.cleanupAdvertiser(advertiser.beeswaxIds.advertiser).then(done,done.fail);
    });

    describe('for a showcase (apps) campaign', function() {
        let beeswaxEntities;

        beforeAll(function(done){
            beeswaxEntities = {};
            return beeswax.createAdvertiser()
            .then(advertiser => { 
                beeswaxEntities.advertiser = advertiser;
                return beeswax.createMRAIDCreative(advertiser);
            })
            .then(creative => {
                beeswaxEntities.creative = creative;
                return beeswax.createCampaign({ 
                    advertiser_id : beeswaxEntities.advertiser.advertiser_id,
                    campaign_budget : 1000
                });
            })
            .then(campaign => {
                beeswaxEntities.campaign = campaign;
                return beeswax.createLineItem({
                    campaign_id      : beeswaxEntities.campaign.campaign_id,
                    advertiser_id    : beeswaxEntities.advertiser.advertiser_id,
                    line_item_budget : 1000
                });
            })
            .then(lineItem => {
                beeswaxEntities.lineItem = lineItem;
                return beeswaxEntities;
            })
            .then(done,done.fail);
        });

        beforeAll(function(done) {
            produce({
                id: createId('cam'),
                status: 'canceled',
                application: 'showcase',
                org: org.id,
                product: {
                    type: 'app'
                },
                targetUsers: 667,
                externalIds: {
                    beeswax: beeswaxEntities.campaign.campaign_id
                }
            })
            .then(() => 
                waitUntil(() =>
                    Promise.all([
                        beeswax.api.lineItems.find(beeswaxEntities.lineItem.line_item_id)
                        .then(response =>
                            response.payload && !response.payload.active && response.payload
                        ),
                        beeswax.api.campaigns.find(beeswaxEntities.campaign.campaign_id)
                        .then(response =>
                            response.payload && !response.payload.active && response.payload
                        )
                    ]).then(items => items.every(item => !!item) && items)
                )
                .then(items => {
                    beeswaxEntities.lineItem = items[0];
                    beeswaxEntities.campaign = items[1];
                })
            )
            .then(done, done.fail);
        });
        
        afterAll(function (done) {
            beeswax.cleanupAdvertiser(beeswaxEntities.advertiser.advertiser_id)
            .then(done,done.fail);
        });

        it('should deactivate the line items', function() {
            expect(beeswaxEntities.lineItem.active).toBe(false);
        });

        it('should deactivate the campaign', function() {
            expect(beeswaxEntities.campaign.active).toBe(false);
        });
    });

    describe('if the org has other campaigns', function(){
        let beeswaxEntities, campaigns;

        function createAnalytics(campaign, days) {
            const showcaseUserViewsTable = ld(days).map(
                (views, index) => Array.apply([], new Array(views)).map( () => `(
                    '${moment().add(index, 'days').format('YYYY-MM-DDT12:00:00') + 'Z'}',
                    '${campaign.id}',
                    '${campaign.org}',
                    '${uuid.createUuid()}'
                )`)
            ).flatten().value();

            return Promise.all([
                testUtils.pgQuery(
                    'INSERT INTO fct.showcase_user_views_daily ' +
                    `VALUES${showcaseUserViewsTable.join(',\n')};`
                )
            ]);
        }


        beforeAll(function(done){
            beeswaxEntities = { };
            let endDate   =  moment(cycleEnd).tz('America/New_York')
                .format('YYYY-MM-DD HH:mm:ss');
            let startDate =  moment(cycleStart).tz('America/New_York')
                .format('YYYY-MM-DD HH:mm:ss');

            beeswax.createMRAIDCreative({ advertiser_id : advertiser.beeswaxIds.advertiser })
            .then(() => 
                Promise.all([
                    beeswax.createCampaign({ 
                        advertiser_id : advertiser.beeswaxIds.advertiser,
                        campaign_budget: 4500,
                        start_date : startDate
                    })
                    .then(campaign => 
                        beeswax.createLineItem({
                            campaign_id : campaign.campaign_id,
                            advertiser_id : campaign.advertiser_id,
                            line_item_budget: 4500,
                            start_date : startDate,
                            end_date : endDate
                        })
                        .then(lineItem => [ campaign, lineItem ])
                    ),
                    beeswax.createCampaign({ 
                        advertiser_id : advertiser.beeswaxIds.advertiser,
                        campaign_budget: 2500,
                        start_date : startDate
                    })
                    .then(campaign => 
                        beeswax.createLineItem({
                            campaign_id : campaign.campaign_id,
                            advertiser_id : campaign.advertiser_id,
                            line_item_budget: 2500,
                            start_date : startDate,
                            end_date : endDate
                        })
                        .then(lineItem => [ campaign, lineItem ])
                    ),
                    beeswax.createCampaign({ 
                        advertiser_id : advertiser.beeswaxIds.advertiser,
                        campaign_budget: 1000,
                        start_date : startDate
                    })
                    .then(campaign => 
                        beeswax.createLineItem({
                            campaign_id : campaign.campaign_id,
                            advertiser_id : campaign.advertiser_id,
                            line_item_budget: 1000,
                            start_date : startDate,
                            end_date : endDate
                        })
                        .then(lineItem => [ campaign, lineItem ])
                    )
                ])
            )
            .then(ld.unzip)
            .then(ld.spread( (campaigns, lineItems) => {
                beeswaxEntities.campaigns = campaigns;
                beeswaxEntities.lineItems = lineItems;
            }))
            .then(() => {
                const ids = [createId('cam'), createId('cam'), createId('cam')];
                
                return testUtils.resetCollection('campaigns', [
                    {
                        id: ids[0],
                        status: 'active',
                        targetUsers: 667,
                        application: 'showcase',
                        product: {
                            type: 'app'
                        },
                        conversionMultipliers: {
                            internal: 1.25,
                            external: 1.5
                        },
                        org: org.id,
                        user: user.id,
                        advertiserId: advertiser.id,
                        externalIds: {
                            beeswax: beeswaxEntities.campaigns[0].campaign_id
                        },
                        pricing: {
                            model: 'cpv',
                            cost: 0.02,
                            budget: 75
                        }
                    },
                    {
                        id: ids[1],
                        status: 'active',
                        targetUsers: 667,
                        application: 'showcase',
                        product: {
                            type: 'app'
                        },
                        org: org.id,
                        user: user.id,
                        advertiserId: advertiser.id,
                        externalIds: {
                            beeswax: beeswaxEntities.campaigns[1].campaign_id
                        },
                        pricing: {
                            model: 'cpv',
                            cost: 0.011,
                            budget: 50
                        }
                    },
                    {
                        id: ids[2],
                        status: 'canceled',
                        application: 'showcase',
                        org: org.id,
                        product: {
                            type: 'app'
                        },
                        targetUsers: 667,
                        externalIds: {
                            beeswax: beeswaxEntities.campaigns[2].campaign_id
                        }
                    }
                ])
                .then(() => request.get({
                    url: api('/api/campaigns'),
                    qs: { ids: ids.join(',') }
                }))
                .spread(result => {
                    campaigns = result;
                    
                    return Promise.all([
                        createAnalytics(campaigns[0], [100, 100, 100, 200]),
                        createAnalytics(campaigns[1], [200, 200, 50, 50]),
                        createAnalytics(campaigns[2], [200, 50, 50, 200])
                    ]);
                });
            })
            .then(done,done.fail);
        });

        beforeAll(function(done){
            produce(campaigns[2])
            .then(() => waitUntil(() => Promise.all([
                Promise.all(campaigns.map((campaign, index) => (
                        request.get({
                            url: api(`/api/campaigns/${campaign.id}`)
                        })
                        .then(ld.spread(campaign => {
                            if (index == 2) {
                                return campaign.status === 'canceled' && campaign;
                            }
                            
                            const oldCampaign = campaigns[index];

                            return (
                                campaign.targetUsers > oldCampaign.targetUsers &&
                                campaign.pricing.budget > oldCampaign.pricing.budget
                            ) && campaign;
                        }))
                )))
                .then(campaigns => campaigns.every(campaign => !!campaign) && campaigns),

                Promise.all(beeswaxEntities.campaigns.map((beeswaxCampaign, index) => (
                    beeswax.api.campaigns.find(beeswaxCampaign.campaign_id)
                    .then(response => {
                        const old = beeswaxEntities.campaigns[index];
                        const updated = response.payload;
                        if (index == 2) {
                            return updated.active === false && updated;
                        }
                        
                        return updated.campaign_budget > old.campaign_budget && updated;
                    })
                )))
                .then(beeswaxCampaigns => beeswaxCampaigns.every(
                    beeswaxCampaign => !!beeswaxCampaign) && beeswaxCampaigns
                ),
                
                Promise.all(beeswaxEntities.lineItems.map((beeswaxlineItem, index) => (
                    beeswax.api.lineItems.find(beeswaxlineItem.line_item_id)
                    .then(response => {
                        //const old = beeswaxEntities.lineItems[index];
                        const updated = response.payload;
                        if (index == 2) {
                            return updated.active === false && updated;
                        }
                        return updated; 
                        //return updated.line_item_budget > old.line_item_budget && updated;
                    })
                )))
                .then(beeswaxLineItems => beeswaxLineItems.every(
                    beeswaxLineItem => !!beeswaxLineItem) && beeswaxLineItems
                )
            ]).then(items => ( items.every(item => !!item) && items))
            ))
            .then(ld.spread(function(/*campaigns, beeswaxCampaigns, beeswaxLineItems*/) {
                campaigns = arguments[0];
                beeswaxEntities.campaigns = arguments[1];
                beeswaxEntities.lineItems = arguments[2];
            }))
            .then(done, done.fail);
        });

        it('should increase the targetUsers of the remaining campaigns', function() {
            expect(campaigns[0].targetUsers).toBe(750);
            expect(campaigns[1].targetUsers).toBe(750);
        });

        it('should increase the budget of the remaining campaigns', function() {
            expect(campaigns[0].pricing.budget).toBe(77.08);
            expect(campaigns[1].pricing.budget).toBe(52.08);
        });

        it('should icrease the budget of the beeswax campaigns', function() {
            expect(beeswaxEntities.campaigns[0].campaign_budget).toBe(4625);
            expect(beeswaxEntities.campaigns[1].campaign_budget).toBe(2604);
        });
    });
});
