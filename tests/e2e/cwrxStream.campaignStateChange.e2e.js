'use strict';

const Configurator = require('../helpers/Configurator.js');
const JsonProducer = require('rc-kinesis').JsonProducer;
const q = require('q');
const ld = require('lodash');
const uuid = require('rc-uuid');
const moment = require('moment');
const BeeswaxClient = require('beeswax-client');
const testUtils = require('cwrx/test/e2e/testUtils');
const resolveURL = require('url').resolve;
const CwrxRequest = require('../../lib/CwrxRequest');

const API_ROOT = process.env.apiRoot;
const APP_CREDS = JSON.parse(process.env.appCreds);
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const CWRX_STREAM = process.env.cwrxStream;
const PREFIX = process.env.appPrefix;
const targeting = require('../helpers/targeting.json');

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
    let producer, beeswax, request;

    function createBeeswaxEntities() {
        return beeswax.advertisers.create({
            advertiser_name: `E2E Test Advertiser (${uuid.createUuid()})`,
            active: true
        }).then(response => {
            const advertiser = response.payload;

            return beeswax.uploadCreativeAsset({
                sourceUrl: 'https://reelcontent.com/images/logo-nav.png',
                advertiser_id: advertiser.advertiser_id
            }).then(asset => (
                beeswax.creatives.create({
                    advertiser_id: advertiser.advertiser_id,
                    creative_type: 0,
                    creative_template_id: 13,
                    width: 300,
                    height: 250,
                    sizeless: true,
                    secure: true,
                    creative_name: `E2E Test Creative (${uuid.createUuid()})`,
                    creative_attributes: {
                        mobile: { mraid_playable: [true] },
                        technical: {
                            banner_mime: ['text/javascript', 'application/javascript'],
                            tag_type: [3]
                        },
                        advertiser: {
                            advertiser_app_bundle: ['com.rc.test-app'],
                            advertiser_domain: ['https://apps.reelcontent.com'],
                            landing_page_url: ['https://apps.reelcontent.com/site/'],
                            advertiser_category: ['IAB24']
                        },
                        video: { video_api: [3] }
                    },
                    creative_content: {
                        TAG: `
                            <script>
                                document.write([
                                    '<a href="{{CLICK_URL}}" target="_blank">',
                                    '    <img src="https://reelcontent.com/images/logo-nav.png" width="300" height="250" />,
                                    '</a>'
                                ].join('\\n');
                            </script>
                        `
                    },
                    creative_thumbnail_url: asset.path_to_asset,
                    active: true
                }).then(response => {
                    const creative = response.payload;

                    return beeswax.campaigns.create({
                        advertiser_id: advertiser.advertiser_id,
                        campaign_name: `E2E Test Campaign (${uuid.createUuid()})`,
                        campaign_budget: 1000,
                        budget_type: 1,
                        start_date: moment().format('YYYY-MM-DD'),
                        pacing: 0,
                        active: true
                    }).then(response => {
                        const campaign = response.payload;

                        return beeswax.targetingTemplates.create(ld.assign({}, targeting, {
                            template_name: `E2E Test Template (${uuid.createUuid()})`,
                            strategy_id: 1,
                            active: true
                        })).then(response => {
                            const targetingTemplate = response.payload;

                            return beeswax.lineItems.create({
                                campaign_id: campaign.campaign_id,
                                advertiser_id: advertiser.advertiser_id,
                                line_item_type_id: 0,
                                targeting_template_id: targetingTemplate.targeting_template_id,
                                line_item_name: `E2E Test Line Item (${uuid.createUuid()})`,
                                line_item_budget: 1000,
                                budget_type: 1,
                                bidding: {
                                    bidding_strategy: 'cpm',
                                    values: {
                                        cpm_bid: 1
                                    }
                                },
                                pacing: 1,
                                start_date: moment().format('YYYY-MM-DD'),
                                end_date: moment().add(1, 'week').format('YYYY-MM-DD'),
                                active: false
                            }).then(response => {
                                const lineItem = response.payload;

                                return beeswax.creativeLineItems.create({
                                    creative_id: creative.creative_id,
                                    line_item_id: lineItem.line_item_id,
                                    active: true
                                }).then(response => {
                                    const creativeLineItem = response.payload;

                                    return beeswax.lineItems.edit(lineItem.line_item_id, { active: true }).then(response => {
                                        const lineItem = response.payload;

                                        return {
                                            advertiser,
                                            creative,
                                            campaign,
                                            targetingTemplate,
                                            lineItem,
                                            creativeLineItem
                                        };
                                    });
                                });
                            });
                        });
                    });
                })
            ));
        });
    }

    function deleteBeeswaxEntities(entities) {
        const creativeLineItem = entities.creativeLineItem;
        const lineItem = entities.lineItem;
        const targetingTemplate = entities.targetingTemplate;
        const campaign = entities.campaign;
        const creative = entities.creative;
        const advertiser = entities.advertiser;

        return beeswax.lineItems.edit(lineItem.line_item_id, { active: false })
            .then(() => beeswax.creativeLineItems.delete(creativeLineItem.cli_id))
            .then(() => beeswax.lineItems.delete(lineItem.line_item_id))
            .then(() => beeswax.targetingTemplates.delete(targetingTemplate.targeting_template_id))
            .then(() => beeswax.campaigns.delete(campaign.campaign_id))
            .then(() => beeswax.creatives.edit(creative.creative_id, { active: false }))
            .then(() => beeswax.creatives.delete(creative.creative_id))
            .then(() => beeswax.advertisers.delete(advertiser.advertiser_id));
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

    function deleteUser(user) {
        return request.get({
            url: api('/api/account/advertisers?org=' + user.org),
            jar: true
        }).spread(function(advertisers) {
            return q.all(advertisers.map(function(advertiser) {
                return beeswax.advertisers.delete(advertiser.beeswaxIds.advertiser);
            }));
        }).then(function() {
            return request.delete({
                url: api('/api/account/users/' + user.id)
            });
        }).then(function deleteOrg() {
            return request.delete({
                url: api('/api/account/orgs/' + user.org)
            });
        }).thenResolve(null);
    }

    function deleteCampaign(campaign) {
        return q().then(function() {
            return request.get({
                url: api('/api/campaigns/' + campaign.id),
                json: true
            });
        }).spread(function(campaign) {
            if (!ld.get(campaign, 'externalIds.beeswax')) { return; }

            return beeswax.campaigns.delete(campaign.externalIds.beeswax);
        }).then(function() {
            return request.get({
                url: api('/api/placements?tagParams.campaign=' + campaign.id),
                json: true
            });
        }).spread(function(placements) {
            return q.all(placements.map(function(placement) {
                var beeswaxId = placement.beeswaxIds && placement.beeswaxIds.creative;

                if (!beeswaxId) { return; }

                return beeswax.creatives.edit(beeswaxId, { active: false })
                    .then(function() {
                        return beeswax.creatives.delete(beeswaxId);
                    });
            }));
        }).then(() => request.delete({
            url: api(`/api/campaigns/${campaign.id}`)
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
                    campaigns: {
                        endpoint: '/api/campaigns'
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
        beeswax = new BeeswaxClient({
            creds: {
                email: 'ops@cinema6.com',
                password: '07743763902206f2b511bead2d2bf12292e2af82'
            }
        });
        request = new CwrxRequest(APP_CREDS);
    });

    beforeEach(function(done) {
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

        Promise.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp])
        ]).then(done, done.fail);
    });

    describe('for a showcase (apps) campaign', function() {
        let campaign, beeswaxEntities, user, org, advertiser;

        function produce() {
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

        beforeEach(function(done) {
            createBeeswaxEntities().then(entities => {
                beeswaxEntities = entities;
            }).then(() => createUser()).then(ld.spread(function(/*user, org, advertiser*/) {
                user = arguments[0];
                org = arguments[1];
                advertiser = arguments[2];

                campaign = {
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
                };
            })).then(() => (
                produce()
            )).then(() => waitUntil(() => Promise.all([
                beeswax.lineItems.find(beeswaxEntities.lineItem.line_item_id).then(response => response.payload && !response.payload.active && response.payload),
                beeswax.campaigns.find(beeswaxEntities.campaign.campaign_id).then(response => response.payload && !response.payload.active && response.payload)
            ]).then(items => items.every(item => !!item) && items)).then(items => {
                beeswaxEntities.lineItem = items[0];
                beeswaxEntities.campaign = items[1];
            })).then(done, done.fail);
        });

        afterEach(function(done) {
            Promise.all([
                deleteBeeswaxEntities(beeswaxEntities).then(done, done.fail),
                deleteUser(user)
            ]).then(done, done.fail);
        });

        it('should deactivate the line items', function() {
            expect(beeswaxEntities.lineItem.active).toBe(false);
        });

        it('should deactivate the campaign', function() {
            expect(beeswaxEntities.campaign.active).toBe(false);
        });

        describe('if the org has other campaigns', function() {
            let today;
            let campaigns, beeswaxCampaigns;

            function createCampaigns() {
                const ids = [createId('cam'), createId('cam')];

                return Promise.resolve().then(() => {
                    return Promise.all([
                        beeswax.campaigns.create({
                            advertiser_id: advertiser.beeswaxIds.advertiser,
                            campaign_name: `E2E Test Campaign (${uuid.createUuid()})`,
                            campaign_budget: 4500,
                            budget_type: 1,
                            start_date: moment().format('YYYY-MM-DD'),
                            pacing: 0,
                            active: true
                        }),
                        beeswax.campaigns.create({
                            advertiser_id: advertiser.beeswaxIds.advertiser,
                            campaign_name: `E2E Test Campaign (${uuid.createUuid()})`,
                            campaign_budget: 2500,
                            budget_type: 1,
                            start_date: moment().format('YYYY-MM-DD'),
                            pacing: 0,
                            active: true
                        })
                    ]);
                }).then(responses => {
                    const beeswaxCampaigns = responses.map(response => response.payload);

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
                                beeswax: beeswaxCampaigns[0].campaign_id
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
                                beeswax: beeswaxCampaigns[1].campaign_id
                            },
                            pricing: {
                                model: 'cpv',
                                cost: 0.011,
                                budget: 50
                            }
                        },
                        campaign
                    ]).then(() => request.get({
                        url: api('/api/campaigns'),
                        qs: { ids: ids.join(',') }
                    })).spread(campaigns => [campaigns, beeswaxCampaigns]);
                });
            }

            function createTransactions() {
                const ids = [createId('t')];

                return testUtils.resetPGTable('fct.billing_transactions', [
                    `(
                        1,
                        current_timestamp,
                        '${ids[0]}',
                        '${today.format()}',
                        '${org.id}',
                        50,
                        1,
                        1,
                        null,
                        null,
                        null,
                        '${JSON.stringify({
                            source: 'braintree',
                            target: 'showcase'
                        })}',
                        2000,
                        '${moment(today).add(1, 'month').subtract(1, 'day').format()}',
                        '${today.format()}',
                        'pp-${uuid.createUuid()}',
                        'showcase'
                    )`
                ]).then(() => (
                    request.get({
                        url: api('/api/transactions'),
                        qs: { org: org.id }
                    })).spread(transactions => (
                        transactions.filter(transaction => ids.indexOf(transaction.id) > -1)
                    ))
                );
            }

            function createAnalytics(campaign, days) {
                const dailyUserViewsTable = days.map((views, index) => `(
                    '${moment(today).add(index, 'days').format()}',
                    '${campaign.id}',
                    ${views}
                )`);
                const showcaseUserViewsTable = ld(days).map((views, index) => Array.apply([], new Array(views)).map(() => `(
                    '${moment(today).add(index, 'days').format()}',
                    '${campaign.id}',
                    '${campaign.org}',
                    '${uuid.createUuid()}'
                )`)).flatten().value();

                return Promise.all([
                    testUtils.pgQuery(`INSERT INTO rpt.unique_user_views_daily VALUES${dailyUserViewsTable.join(',\n')};`),
                    testUtils.pgQuery(`INSERT INTO fct.showcase_user_views_daily VALUES${showcaseUserViewsTable.join(',\n')};`)
                ]);
            }

            beforeEach(function(done) {
                today = moment().utcOffset(0).startOf('day');

                createTransactions().then(function(/*transactions*/) {

                }).then(() => createCampaigns()).spread(function(/*campaigns, beeswaxCampaigns*/) {
                    campaigns = arguments[0];
                    beeswaxCampaigns = arguments[1];
                }).then(() => Promise.all([
                    createAnalytics(campaigns[0], [100, 100, 100, 200]),
                    createAnalytics(campaigns[1], [200, 200, 50, 50]),
                    createAnalytics(campaign, [200, 50, 50, 200])
                ])).then(() => (
                    produce()
                )).then(() => waitUntil(() => Promise.all([
                    Promise.all(campaigns.map((campaign, index) => (
                        request.get({
                            url: api(`/api/campaigns/${campaign.id}`)
                        }).then(ld.spread(campaign => {
                            const oldCampaign = campaigns[index];

                            return (
                                campaign.targetUsers > oldCampaign.targetUsers &&
                                campaign.pricing.budget > oldCampaign.pricing.budget
                            ) && campaign;
                        }))
                    ))).then(campaigns => campaigns.every(campaign => !!campaign) && campaigns),
                    Promise.all(beeswaxCampaigns.map((beeswaxCampaign, index) => (
                        beeswax.campaigns.find(beeswaxCampaign.campaign_id).then(response => {
                            const oldBeeswaxCampaign = beeswaxCampaigns[index];
                            const beeswaxCampaign = response.payload;

                            return beeswaxCampaign.campaign_budget > oldBeeswaxCampaign.campaign_budget && beeswaxCampaign;
                        })
                    ))).then(beeswaxCampaigns => beeswaxCampaigns.every(beeswaxCampaign => !!beeswaxCampaign) && beeswaxCampaigns),
                    Promise.all([
                        beeswax.lineItems.find(beeswaxEntities.lineItem.line_item_id).then(response => response.payload && !response.payload.active && response.payload),
                        beeswax.campaigns.find(beeswaxEntities.campaign.campaign_id).then(response => response.payload && !response.payload.active && response.payload)
                    ]).then(items => items.every(item => !!item) && items)
                ]).then(items => (
                    items.every(item => !!item) && items
                )))).then(ld.spread(function(/*campaigns, beeswaxCampaigns*/) {
                    campaigns = arguments[0];
                    beeswaxCampaigns = arguments[1];
                })).then(done, done.fail);
            });

            afterEach(function(done) {
                Promise.all([
                    Promise.all(campaigns.map(campaign => deleteCampaign(campaign))),
                    testUtils.pgQuery('DELETE FROM fct.billing_transactions'),
                    testUtils.pgQuery('DELETE FROM rpt.unique_user_views_daily'),
                    testUtils.pgQuery('DELETE FROM fct.showcase_user_views_daily')
                ]).then(done, done.fail);
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
                expect(beeswaxCampaigns[0].campaign_budget).toBe(4625);
                expect(beeswaxCampaigns[1].campaign_budget).toBe(2604);
            });
        });
    });
});
