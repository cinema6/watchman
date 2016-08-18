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
var BeeswaxHelper = require('../helpers/BeeswaxHelper');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var PREFIX = process.env.appPrefix;

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

describe('cwrxStream campaignCreated', function() {
    var producer, request, beeswax, today, cookies;
    var user, org, paymentPlans, advertiser, promotions, containers, campaign;

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function findBeeswaxCampaign(campaign) {
        return request.get({
            url: api(`/api/campaigns/${campaign.id}`)
        })
        .then(ld.spread(newCampaign => 
            ld.get(newCampaign, 'externalIds.beeswax') && 
            beeswax.api.campaigns.find(newCampaign.externalIds.beeswax)
            .then(response => 
                ( response.payload.campaign_budget === 1 && response.payload )
            )
            .then(camp => 
                beeswax.api.creatives.query({
                    advertiser_id : camp.advertiser_id
                })
                .then(response => response.payload[0] && camp)
            )
        ))
        .catch(() => undefined);
    }

    function campaignCreatedEvent(time, campaignOverride) {
        return producer.produce({
            type: 'campaignCreated',
            data: {
                campaign: campaignOverride || campaign,
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
        var paymentPlanIds = [createId('pp'), createId('pp')];

        return testUtils.resetCollection('paymentPlans', [
            {
                id: paymentPlanIds[0],
                label: 'Starter',
                price: 39.99,
                maxCampaigns: 1,
                viewsPerMonth: 2000,
                created: '2016-07-05T14:18:29.642Z',
                lastUpdated: '2016-07-05T14:28:57.336Z',
                status: 'active'
            },
            {
                id: paymentPlanIds[1],
                label: 'Pro',
                price: 149.99,
                maxCampaigns: 5,
                viewsPerMonth: 7500,
                created: '2016-07-05T14:18:29.642Z',
                lastUpdated: '2016-07-05T14:28:57.336Z',
                status: 'active'
            }
        ]).then(function makeOrg() {
            return testUtils.resetCollection('orgs', [{
                id: orgId,
                status: 'active',
                name: 'The Best Org',
                paymentPlanId: null,
                paymentPlanStart: moment().format()
            }]);
        }).then(function makePolicy() {
            return testUtils.resetCollection('policies', [{
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
                    },
                    jar: true
                }).then(ld.property(0));
            });
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
                    url: api('/api/payment-plans'),
                    qs: {
                        ids: paymentPlanIds.join(',')
                    }
                }).then(ld.property('0'))
            ]);
        });
    }

    const nonces = [
        'fake-valid-visa-nonce',
        'fake-valid-amex-nonce',
        'fake-valid-mastercard-nonce',
        'fake-valid-discover-nonce',
        'fake-paypal-future-nonce'
    ];
    let nonceIndex = -1;
    function createPaymentMethod(data) {
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
            });
        });
    }

    function deleteUser(user) {
        return request.get({
            url: api('/api/account/advertisers?org=' + user.org),
            jar: true
        }).spread(function(advertisers) {
            return q.all(advertisers.map(function(advertiser) {
                return beeswax.cleanupAdvertiser(advertiser.externalIds.beeswax);
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

            return beeswax.cleanupCampaign(campaign.externalIds.beeswax );
        //}).then(function() {
        //    return request.get({
        //        url: api('/api/placements?tagParams.campaign=' + campaign.id),
        //        json: true
        //    });
        //}).spread(function(placements) {
        //    return q.all(placements.map(function(placement) {
        //        return;
        //        //var beeswaxId = placement.externalIds && placement.externalIds.beeswax;
        //        
        //        //if (!beeswaxId) { return; }

        //        //return beeswax.api.creatives.edit(beeswaxId, { active: false }, false)
        //        //    .then(function() {
        //        //        return beeswax.api.creatives.delete(beeswaxId, false);
        //        //    });
        //    }));
        }).then(() => request.delete({
            url: api(`/api/campaigns/${campaign.id}`)
        }));
    }

    // This beforeAll is dedicated to setting application config
    beforeAll(function(done) {
        today = moment().utcOffset(0).startOf('day');
        const configurator = new Configurator();
        const sharedConfig = {
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
                    orgs: {
                        endpoint: '/api/account/orgs'
                    },
                    promotions: {
                        endpoint: '/api/promotions'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
                    },
                    payments: {
                        endpoint: '/api/payments/'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
                    },
                    users: {
                        endpoint: '/api/account/users'
                    },
                    advertisers: {
                        endpoint: '/api/account/advertisers'
                    },
                    transactions: {
                        endpoint: '/api/transactions'
                    }
                }
            },
            emails: {
                sender: 'support@cinema6.com',
                supportAddress: 'c6e2etester@gmail.com',
                dashboardLinks: {
                    selfie: 'http://localhost:9000/#/apps/selfie/campaigns',
                    showcase: 'http://localhost:9000/#/showcase/products'
                },
                beeswax: {
                    campaignLink: 'http://stingersbx.beeswax.com/advertisers/{{advertiserId}}/campaigns/{{campaignId}}/line_items'
                }
            },
            postmark: {
                templates: {
                    initializedShowcaseCampaign: '672910',
                    campaignActive: '672909',
                    'campaignActive--app': '694541'
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
                campaignCreated: {
                    actions: [
                        {
                            name: 'showcase/apps/init_campaign',
                            ifData: {
                                'campaign.application': '^showcase$',
                                'campaign.product.type': '^app$'
                            },
                            options: {
                                card: {
                                    interstitial: {
                                        cardType: 'showcase-app'
                                    },
                                    threeHundredByTwoFifty: {
                                        cardType: 'showcase-app'
                                    }
                                },
                                placement: {
                                    interstitial: {
                                        tagType: 'mraid',
                                        tagParams: {
                                            container: { value: 'beeswax' },
                                            type: { value: 'mobile-card' },
                                            branding: { value: 'showcase-app--interstitial' },
                                            hostApp: { value: '{{APP_BUNDLE}}', inTag: true },
                                            network: { value: '{{INVENTORY_SOURCE}}', inTag: true },
                                            uuid: { value: '{{IOS_ID}}', inTag: true },
                                            clickUrls: { value: ['{{CLICK_URL}}'], inTag: true },
                                            forceOrientation: { value: 'none' }
                                        }
                                    },
                                    threeHundredByTwoFifty: {
                                        tagType: 'display',
                                        tagParams: {
                                            container: { value: 'beeswax' },
                                            type: { value: 'mobile-card' },
                                            branding: { value: 'showcase-app--300x250' }
                                        }
                                    }
                                }
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
                initializedShowcaseCampaign: {
                    actions: [
                        {
                            name: 'activate_payment_plan',
                            options: {
                                target: 'showcase'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'campaignActive'
                            }
                        },
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'initializedShowcaseCampaign',
                                toSupport: true
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

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
        beeswax = new BeeswaxHelper();
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

        cookies = require('request').jar();

        containers = [
            {
                created: '2016-03-24T19:18:49.696Z',
                defaultTagParams: {
                    mraid: {
                        apiRoot: 'https://platform.reelcontent.com/',
                        container: 'beeswax',
                        hostApp: '{{APP_BUNDLE}}',
                        network: '{{INVENTORY_SOURCE}}',
                        uuid: '{{IOS_ID}}',
                        clickUrls: [
                            '{{CLICK_URL}}'
                        ],
                        prebuffer: true,
                        forceOrientation: 'none'
                    },
                    vpaid: {
                        apiRoot: 'https://platform.reelcontent.com/',
                        container: 'beeswax',
                        network: '{{INVENTORY_SOURCE}}',
                        uuid: '{{USER_ID}}'
                    }
                },
                id: 'con-0gW0lk01YbKAgFOb',
                label: 'Beeswax',
                lastUpdated: '2016-04-26T17:56:06.582Z',
                name: 'beeswax',
                status: 'active'
            }
        ];

        q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp]),
            testUtils.resetCollection('policies', []),
            testUtils.resetCollection('orgs', []),
            testUtils.resetCollection('users', []),
            testUtils.resetCollection('containers', containers),
            testUtils.resetCollection('campaigns', [])
        ]).then(function() {
            return createUser();
        }).spread(function(/*user, org, advertiser, paymentPlan*/) {
            user = arguments[0];
            org = arguments[1];
            advertiser = arguments[2];
            paymentPlans = arguments[3];
            promotions = [
                {
                    id: createId('ref'),
                    status: 'active',
                    created: moment().subtract(6, 'months').format(),
                    lastUpdated: moment().subtract(6, 'months').format(),
                    name: '10-Day Free Trial',
                    type: 'freeTrial',
                    data: {
                        [paymentPlans[0].id]: {
                            trialLength: 10,
                            paymentMethodRequired: false,
                            targetUsers: 750
                        },
                        [paymentPlans[1].id]: {
                            paymentMethodRequired: true,
                            targetUsers: 1000
                        }
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
                        [paymentPlans[0].id]: {
                            trialLength: 7,
                            paymentMethodRequired: false,
                            targetUsers: 500
                        }
                    }
                }
            ];

            campaign = {
                id: createId('cam'),
                user: user.id,
                org: org.id,
                created: moment().format(),
                lastUpdated: moment().format(),
                advertiserId: advertiser.id,
                application: 'showcase',
                cards: [],
                name: 'Count Coins',
                product: {
                    type: 'app',
                    platform: 'iOS',
                    name: 'Count Coins',
                    description: 'Reinforce basic counting skills by counting coins.  This app is a valuable tool for elementary school aged children building fundamental counting skills.  It can also be a useful training assistant for those seeking work as cashiers, where making change accurately is important.',
                    developer: 'Howard Engelhart',
                    uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
                    categories: [
                        'Education',
                        'Games',
                        'Educational'
                    ],
                    price: 'Free',
                    extID: 595124272,
                    images: [
                        {
                            uri: 'http://a1.mzstatic.com/us/r30/Purple/v4/c2/ec/6b/c2ec6b9a-d47b-20e4-d1f7-2f42fffcb58f/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://a5.mzstatic.com/us/r30/Purple/v4/fc/4b/e3/fc4be397-6865-7011-361b-59f78c789e62/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://a5.mzstatic.com/us/r30/Purple/v4/f9/02/63/f902630c-3969-ab9f-07b4-2c91bd629fd0/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://a3.mzstatic.com/us/r30/Purple/v4/f8/21/0e/f8210e8f-a75a-33c0-9e86-e8c65c9faa54/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://is5.mzstatic.com/image/thumb/Purple/v4/ef/a0/f3/efa0f340-225e-e512-1616-8f223c6202ea/source/512x512bb.jpg',
                            type: 'thumbnail'
                        }
                    ],
                    websites : [
                        'http://mechinate.tumblr.com/'
                    ]
                },
                status: 'draft',
                statusHistory: [
                    {
                        date: moment().format(),
                        status: 'draft',
                        userId: user.id,
                        user: 'e2e@reelcontent.com'
                    }
                ],
                targeting: {
                    demographics: {
                        age: [],
                        gender: []
                    },
                    appStoreCategory: [
                        'Education',
                        'Games',
                        'Educational'
                    ]
                }
            };

            return Promise.all([
                testUtils.resetCollection('campaigns', ld.cloneDeep([campaign])),
                testUtils.resetCollection('promotions', promotions),
                testUtils.resetPGTable('fct.billing_transactions')
            ]);
        }).then(done, done.fail);
    });

    afterEach(function(done) {
        deleteCampaign(campaign).then(function() {
            return deleteUser(user);
        }).then(done, done.fail);
    });

    describe('when produced', function() {
        var placements ;

        beforeEach(function(done) {
            campaignCreatedEvent().then(function() {
                return waitUntil(function() {
                    return request.get({
                        url: api('/api/campaigns/' + campaign.id),
                        json: true
                    }).spread(function(campaign) {
                        return campaign.externalIds && campaign.cards.length > 0 && campaign;
                    });
                });
            }).then(function(/*campaign*/) {
                campaign = arguments[0];

                return waitUntil(function() {
                    return request.get({
                        url: api('/api/placements?tagParams.campaign=' + campaign.id),
                        json: true
                    }).spread(function(placements) {
                        return placements.length === campaign.cards.length && placements;
                    });
                });
            }).then(function(/*placements*/) {
                placements = arguments[0];

                return waitUntil(function() {
                    return request.get({
                        url: api('/api/account/advertisers/' + campaign.advertiserId),
                        json: true
                    }).spread(function(advertiser) {
                        return advertiser.externalIds && advertiser;
                    });
                });
            }).then(function(/*advertiser*/) {
                advertiser = arguments[0];
                return waitUntil(() => 
                    findBeeswaxCampaign(campaign).then(beeswaxCampaign => !!beeswaxCampaign)
                );
            }).then(done, done.fail);
        });

        it('should create a campaign in beeswax', function() {
            expect(campaign.externalIds.beeswax).toEqual(jasmine.any(Number));
        });

        it('should create one card', function() {
            expect(campaign.cards[0]).toEqual(jasmine.objectContaining({
                advertiserId: advertiser.id,
                campaign: {
                    minViewTime: jasmine.any(Number),
                    reportingId: 'Count Coins'
                },
                collateral: jasmine.any(Object),
                data: jasmine.objectContaining({
                    advanceInterval: jasmine.any(Number),
                    moat: jasmine.any(Object),
                    slides: jasmine.any(Array)
                }),
                id: jasmine.any(String),
                links: jasmine.objectContaining({
                    Action: jasmine.any(Object)
                }),
                modules: [],
                note: jasmine.any(String),
                params: {
                    action: {
                        label: jasmine.any(String),
                        type: 'button'
                    },
                    sponsor: 'Howard Engelhart'
                },
                shareLinks: jasmine.any(Object),
                sponsored: true,
                status: 'active',
                thumbs: {
                    small: jasmine.any(String),
                    large: jasmine.any(String)
                },
                title: jasmine.any(String),
                type: 'showcase-app'
            }));
            //expect(campaign.cards[1]).toEqual(jasmine.objectContaining({
            //    advertiserId: advertiser.id,
            //    campaign: {
            //        minViewTime: jasmine.any(Number),
            //        reportingId: 'Count Coins'
            //    },
            //    collateral: jasmine.any(Object),
            //    data: jasmine.objectContaining({
            //        advanceInterval: jasmine.any(Number),
            //        moat: jasmine.any(Object),
            //        slides: jasmine.any(Array)
            //    }),
            //    id: jasmine.any(String),
            //    links: jasmine.objectContaining({
            //        Action: jasmine.any(Object)
            //    }),
            //    modules: [],
            //    note: jasmine.any(String),
            //    params: {
            //        action: {
            //            label: jasmine.any(String),
            //            type: 'button'
            //        },
            //        sponsor: 'Howard Engelhart'
            //    },
            //    shareLinks: jasmine.any(Object),
            //    sponsored: true,
            //    status: 'active',
            //    thumbs: {
            //        small: jasmine.any(String),
            //        large: jasmine.any(String)
            //    },
            //    title: jasmine.any(String),
            //    type: 'showcase-app'
            //}));
        });

        it('should create one placement', function() {
            expect(ld.find(placements, { tagType: 'mraid' })).toEqual(jasmine.objectContaining({
                label: 'Showcase--Interstitial for App: "Count Coins"',
                tagType: 'mraid',
                tagParams: jasmine.objectContaining({
                    container: 'beeswax',
                    type: 'mobile-card',
                    branding: 'showcase-app--interstitial',
                    card: campaign.cards[0].id,
                    campaign: campaign.id
                }),
                showInTag: jasmine.objectContaining({}),
                thumbnail: campaign.cards[0].thumbs.small,
                id: jasmine.any(String),
                created: jasmine.any(String),
                lastUpdated: jasmine.any(String),
                status: 'active'
            }));
            //expect(ld.find(placements, { tagType: 'display' })).toEqual(jasmine.objectContaining({
            //    label: 'Showcase--300x250 for App: "Count Coins"',
            //    tagType: 'display',
            //    tagParams: jasmine.objectContaining({
            //        container: 'beeswax',
            //        type: 'mobile-card',
            //        branding: 'showcase-app--300x250',
            //        card: campaign.cards[1].id,
            //        campaign: campaign.id
            //    }),
            //    showInTag: jasmine.objectContaining({}),
            //    thumbnail: campaign.cards[1].thumbs.small,
            //    id: jasmine.any(String),
            //    created: jasmine.any(String),
            //    lastUpdated: jasmine.any(String),
            //    status: 'active'
            //}));
        });
    });

    describe('if the org has other campaigns', function() {
        let campaigns, beeswaxCampaigns, beeswaxCampaign, beeswaxLineItem, beeswaxLineItems;

        function createCampaigns() {
            const ids = [createId('cam'), createId('cam')];
            const start_date = moment(today)
                .tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');
            return Promise.resolve().then(() => {
                return Promise.all([
                    Promise.all([
                        beeswax.createCampaign({
                            advertiser_id: advertiser.externalIds.beeswax,
                            campaign_budget: 4500,
                            start_date : start_date
                        }),
                        beeswax.createCampaign({
                            advertiser_id: advertiser.externalIds.beeswax,
                            campaign_budget: 2500,
                            start_date : start_date
                        })
                    ]),
                    Promise.all([
                        beeswax.createMRAIDCreative({
                            advertiser_id: advertiser.externalIds.beeswax
                        }),
                        beeswax.createMRAIDCreative({
                            advertiser_id: advertiser.externalIds.beeswax
                        })
                    ])
                ]);
            }).then(responses => {
                const beeswaxCampaigns = responses[0];
                const beeswaxCreatives = responses[1];
                const endDate = moment(today)
                    .add(1,'month').subtract(1,'second')
                    .tz('America/New_York').format('YYYY-MM-DD HH:mm:ss');

                return Promise.all(beeswaxCampaigns.map(function(bwCamp){
                    return beeswax.createLineItem({
                        advertiser_id : bwCamp.advertiser_id,
                        campaign_id : bwCamp.campaign_id,
                        line_item_budget : 100,
                        end_date : endDate
                    });
                })).then(lineItems => {
                    return [ beeswaxCampaigns, beeswaxCreatives, lineItems ]; 
                });

            }).then(responses => {
                const beeswaxCampaigns = responses[0];
                const beeswaxCreatives = responses[1];

                return testUtils.resetCollection('campaigns', [
                    {
                        id: ids[0],
                        status: 'active',
                        targetUsers: 1000,
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
                        targetUsers: 1000,
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
                ]).then(() => 
                    testUtils.resetCollection('placements', [
                        {
                            id : createId('pl'),
                            label : 'Placement1',
                            tagType : 'display',
                            tagParams : {
                                container : 'beeswax',
                                type : 'mobile-card',
                                campaign : ids[0]
                            },
                            status : 'active',
                            externalIds : {
                                beeswax : 666
                            }
                        },
                        {
                            id : createId('pl'),
                            label : 'Placement1',
                            tagType : 'mraid',
                            tagParams : {
                                container : 'beeswax',
                                type : 'mobile-card',
                                campaign : ids[0]
                            },
                            status : 'active',
                            externalIds : {
                                beeswax : beeswaxCreatives[0].creative_id
                            }
                        },
                        {
                            id : createId('pl'),
                            label : 'Placement1',
                            tagType : 'mraid',
                            tagParams : {
                                container : 'beeswax',
                                type : 'mobile-card',
                                campaign : ids[1]
                            },
                            status : 'active',
                            externalIds : {
                                beeswax : beeswaxCreatives[1].creative_id
                            }
                        }
                    ])
                ).then(() => request.get({
                    url: api('/api/campaigns'),
                    qs: { ids: ids.join(',') }
                })).spread(campaigns => (
                    [
                        campaigns.sort(campaign => (campaign.id === ids[0] ? -1 : 1)),
                        beeswaxCampaigns
                    ]
                ));
            });
        }

        function createTransactions() {
            const ids = [createId('t')];
            const cycleStart = moment(today).format('YYYY-MM-DDT00:00:00') + 'Z';
            const cycleEnd = moment(today).add(1,'month').subtract(1,'day')
                .format('YYYY-MM-DDT23:59:59') + 'Z';

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
                    '${cycleEnd}',
                    '${cycleStart}',
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
            const showcaseUserViewsTable = ld(days).map((views, index) => Array.apply([], new Array(views)).map(() => `(
                '${moment(today).add(index, 'days').format()}',
                '${campaign.id}',
                '${campaign.org}',
                '${uuid.createUuid()}'
            )`)).flatten().value();

            return Promise.all([
                testUtils.pgQuery(`INSERT INTO fct.showcase_user_views_daily VALUES${showcaseUserViewsTable.join(',\n')};`)
            ]);
        }

        beforeEach(function(done) {
            createTransactions().then(function(/*transactions*/) {

            }).then(() => createCampaigns()).spread(function(/*campaigns, beeswaxCampaigns*/) {
                campaigns = arguments[0];
                beeswaxCampaigns = arguments[1];
            }).then(() => Promise.all([
                createAnalytics(campaigns[0], [100, 100, 100, 200]),
                createAnalytics(campaigns[1], [200, 200, 50, 50])
            ])).then(() => (
                campaignCreatedEvent()
            )).then(() => waitUntil(() => Promise.all([
                request.get({
                    url: api(`/api/campaigns/${campaign.id}`)
                }).then(ld.spread(newCampaign => {
                    return (
                        ld.get(newCampaign, 'targetUsers', 0) > ld.get(campaign, 'targetUsers', 0) &&
                        ld.get(newCampaign, 'pricing.budget', 0) > ld.get(campaign, 'pricing.budget', 0)
                    ) && newCampaign;
                })),
                Promise.all(campaigns.map((campaign, index) => (
                    request.get({
                        url: api(`/api/campaigns/${campaign.id}`)
                    }).then(ld.spread(campaign => {
                        const oldCampaign = campaigns[index];

                        return (
                            campaign.targetUsers < oldCampaign.targetUsers &&
                            campaign.pricing.budget < oldCampaign.pricing.budget
                        ) && campaign;
                    }))
                ))).then(campaigns => campaigns.every(campaign => !!campaign) && campaigns),
                request.get({
                    url: api(`/api/campaigns/${campaign.id}`)
                }).then(ld.spread(campaign => (
                    ld.get(campaign, 'externalIds.beeswax') && 
                    Promise.all([
                        beeswax.api.campaigns.find(campaign.externalIds.beeswax)
                        .then(response => 
                            ( response.payload.campaign_budget > 1 && response.payload )
                        )
                        .then(camp => {
                            return beeswax.api.creatives.query({
                                advertiser_id : camp.advertiser_id
                            })
                            .then(response => response.payload[0] && camp );
                        }),
                        beeswax.api.lineItems.query({
                            campaign_id : campaign.externalIds.beeswax
                        })
                        .then(response => {
                            return (response.payload[0] &&
                                response.payload[0].active && response.payload[0]);
                        })
                        .then(lineItem => {
                            return (!!lineItem && 
                                beeswax.api.creativeLineItems.query({
                                    line_item_id : lineItem.line_item_id 
                                })
                                .then(result => {
                                    lineItem.mappings = result.payload;
                                    return !!lineItem.mappings && lineItem;
                                })
                            );
                        })
                    ])
                    .then((items) =>  items.every(item => (!!item)) && items)
                ))),
                Promise.all(beeswaxCampaigns.map(beeswaxCampaign => {
                    return beeswax.api.lineItems.query({
                        campaign_id : beeswaxCampaign.campaign_id
                    })
                    .then(response => response.payload[0] && 
                        (response.payload[0].line_item_budget !== 100) && 
                        response.payload[0].active && response.payload[0])
                    .then(lineItem => !!lineItem && 
                        beeswax.api.creativeLineItems.query({
                            line_item_id : lineItem.line_item_id 
                        })
                        .then(result => {
                            lineItem.mappings = result.payload;
                            return beeswax.api.campaigns.find(lineItem.campaign_id);
                        })
                        .then(result => {
                            lineItem.campaign = result.payload;
                            return lineItem;
                        })
                    );
                }))
                .then(beeswaxLineItems => 
                    beeswaxLineItems.every(item => (!!item)) && beeswaxLineItems
                )
            ]).then(items => (
                items.every(item => !!item) && items
            )))).then(ld.spread(function(/*campaign, campaigns, beeswaxCampaign, beeswaxCampaigns*/) {
                campaign = arguments[0];
                campaigns = arguments[1];
                beeswaxCampaign = arguments[2][0];
                beeswaxLineItem = arguments[2][1];
                beeswaxLineItems = arguments[3];
                beeswaxCampaigns = beeswaxLineItems.map(item => item.campaign);

            })).then(done, done.fail);
        });

        afterEach(function(done) {
            Promise.all([
                Promise.all(campaigns.map(campaign => deleteCampaign(campaign))),
                testUtils.pgQuery('DELETE FROM fct.billing_transactions'),
                testUtils.pgQuery('DELETE FROM fct.showcase_user_views_daily')
            ]).then(done, done.fail);
        });

        it('should set the targetUsers on each campaign', function() {
            expect(campaigns[0].targetUsers).toBe(833);
            expect(campaigns[1].targetUsers).toBe(833);
            expect(campaign.targetUsers).toBe(333);
        });

        it('should set the budget of the existing campaigns', function() {
            expect(campaigns[0].pricing.budget).toBe(70.83);
            expect(campaigns[1].pricing.budget).toBe(45.83);
        });

        it('should give the new campaign a pricing hash', function() {
            expect(campaign.pricing).toEqual({
                budget: 8.33,
                model: 'cpv',
                cost: 0.05
            });
        });

        it('should increase the budget of the beeswax campaigns', function() {
            expect(beeswaxCampaigns[0].campaign_budget).toBe(4500);
            expect(beeswaxCampaigns[1].campaign_budget).toBe(2500);
            expect(beeswaxCampaign.campaign_budget).toBe(417);
            expect(beeswaxLineItem.line_item_budget).toBe(416);
            expect(beeswaxLineItem.mappings.length).toEqual(1);
            expect(beeswaxLineItems[0].line_item_budget).toBe(1250);
            expect(beeswaxLineItems[0].mappings.length).toEqual(1);
            expect(beeswaxLineItems[1].line_item_budget).toBe(1041);
            expect(beeswaxLineItems[1].mappings.length).toEqual(1);
        });
    });

    describe('if the org has a paymentPlanStart', function() {
        var existing;

        beforeEach(function(done) {
            existing = moment().subtract(3, 'days');

            updatePaymentPlanStart(existing)
            .then(() => campaignCreatedEvent())
            .then(() => waitUntil(() => 
                findBeeswaxCampaign(campaign).then(beeswaxCampaign => !!beeswaxCampaign)
            ))
            .then(() => getOrg())
            .then(function(/*org*/) {
                org = arguments[0];
            })
            .then(done, done.fail);
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
                updatePaymentPlan(null)
                .then(() => campaignCreatedEvent())
                .then(() => waitUntil(() => 
                    findBeeswaxCampaign(campaign).then(beeswaxCampaign => !!beeswaxCampaign)
                ))
                //}).then(function() { //    return wait(8000);
                .then(() => getOrg())
                .then(function(/*org*/) {
                    org = arguments[0];
                })
                .then(done, done.fail);
            });

            it('should not give the org a paymentPlanStart', function() {
                expect(org.paymentPlanStart).toBeNull();
                expect(org.nextPaymentDate).not.toBeDefined();
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
            var now, paymentPlan;

            beforeEach(function(done) {
                now = moment();

                paymentPlan = paymentPlans[0];

                updatePaymentPlan(paymentPlan.id).then(function() {
                    return getOrg();
                }).then(function(/*org*/) {
                    org = arguments[0];
                }).then(done, done.fail);
            });

            describe('but no promotions', function() {
                beforeEach(function(done) {
                    updatePromotions([])
                    .then(() => createPaymentMethod({ user }))
                    .then(() => campaignCreatedEvent(now))
                    .then(() => waitUntil(() => 
                        findBeeswaxCampaign(campaign)
                        .then(beeswaxCampaign => !!beeswaxCampaign)
                    ))
                    .then(function() {
                        return waitUntil(function() {
                            return getOrg().then(function(org) {
                                // The org's nextPaymentDate will be the last thing to be updated after
                                // they are charged.
                                return org.nextPaymentDate && org;
                            });
                        });
                    }).then(function(/*org*/) {
                        org = arguments[0];
                    }).then(done, done.fail);
                });

                it('should give the org a paymentPlanStart of now', function() {
                    expect(moment(org.paymentPlanStart).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').format());
                });

                it('should give the org a nextPaymentDate of one month from now', function() {
                    expect(moment(org.nextPaymentDate).utcOffset(0).format()).toBe(moment(now).utcOffset(0).add(1, 'month').startOf('day').format());
                });

                it('should charge the user', function(done) {
                    testUtils.pgQuery(
                        'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                        [org.id]
                    ).then(function(result) {
                        const transaction = result.rows[0];

                        expect(transaction).toEqual(jasmine.objectContaining({
                            rec_key: jasmine.any(String),
                            rec_ts: jasmine.any(Date),
                            transaction_id: jasmine.any(String),
                            transaction_ts: jasmine.any(Date),
                            org_id: org.id,
                            amount: '39.9900',
                            sign: 1,
                            units: 1,
                            campaign_id: null,
                            braintree_id: jasmine.any(String),
                            promotion_id: null,
                            description: '{"eventType":"credit","source":"braintree"}',
                            view_target: paymentPlan.viewsPerMonth,
                            cycle_end: jasmine.any(Date),
                            cycle_start: jasmine.any(Date),
                            paymentplan_id: paymentPlan.id,
                            application: 'showcase'
                        }));

                        expect(moment(transaction.cycle_start).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').format(), 'cycle_start is incorrect');
                        expect(moment(transaction.cycle_end).utcOffset(0).format()).toBe(moment(now).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(), 'cycle_end is incorrect');
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
                    })
                    .then(() => waitUntil(() => 
                        findBeeswaxCampaign(campaign)
                        .then(beeswaxCampaign => !!beeswaxCampaign)
                    ))
                    .then(function() {
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
                    expect(moment(org.paymentPlanStart).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').add(17, 'days').format());
                    expect(moment(org.nextPaymentDate).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').add(17, 'days').format());
                });

                it('should create transactions for each promotion', function() {
                    expect(transactions[0]).toEqual(jasmine.objectContaining({
                        rec_key: jasmine.any(String),
                        rec_ts: jasmine.any(Date),
                        transaction_id: jasmine.any(String),
                        transaction_ts: jasmine.any(Date),
                        org_id: org.id,
                        amount: '10.0000',
                        sign: 1,
                        units: 1,
                        campaign_id: null,
                        braintree_id: null,
                        promotion_id: promotions[2].id,
                        application: 'showcase',
                        paymentplan_id: paymentPlan.id,
                        view_target: 500,
                        cycle_start: jasmine.any(Date),
                        cycle_end: jasmine.any(Date)
                    }));
                    expect(moment(transactions[0].cycle_start).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').format(), 'cycle_start is not correct.');
                    expect(moment(transactions[0].cycle_end).utcOffset(0).format()).toBe(moment(now).utcOffset(0).add(7, 'days').endOf('day').format(), 'cycle_end is not correct.');

                    expect(transactions[1]).toEqual(jasmine.objectContaining({
                        rec_key: jasmine.any(String),
                        rec_ts: jasmine.any(Date),
                        transaction_id: jasmine.any(String),
                        transaction_ts: jasmine.any(Date),
                        org_id: org.id,
                        amount: '15.0000',
                        sign: 1,
                        units: 1,
                        campaign_id: null,
                        braintree_id: null,
                        promotion_id: promotions[0].id,
                        application: 'showcase',
                        paymentplan_id: paymentPlan.id,
                        view_target: 750,
                        cycle_start: jasmine.any(Date),
                        cycle_end: jasmine.any(Date)
                    }));
                    expect(moment(transactions[1].cycle_start).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').format(), 'cycle_start is not correct.');
                    expect(moment(transactions[1].cycle_end).utcOffset(0).format()).toBe(moment(now).utcOffset(0).add(10, 'days').endOf('day').format(), 'cycle_end is not correct.');
                });

                describe('and the promotion should be for bonus views', function() {
                    let campaign2;

                    beforeEach(function(done) {
                        paymentPlan = paymentPlans[1];

                        campaign2 = ld.cloneDeep(campaign);
                        campaign2.id = createId('cam');

                        Promise.all([
                            updatePaymentPlan(paymentPlan.id).then(() => updatePaymentPlanStart(null)),
                            testUtils.mongoUpsert('campaigns', { id: campaign2.id }, campaign2),
                            testUtils.pgQuery('DELETE FROM fct.billing_transactions'),
                            createPaymentMethod({ user })
                        ]).then(ld.spread(function(/*org*/) {
                            org = arguments[0];

                            return campaignCreatedEvent(now, campaign2);
                        })).then(function() {
                            return waitUntil(function() {
                                return q.all([
                                    testUtils.pgQuery(
                                        'SELECT * FROM fct.billing_transactions WHERE org_id = $1',
                                        [org.id]
                                    ),
                                    getOrg()
                                ]).spread(function(queryResult, org) {
                                    return org.nextPaymentDate && queryResult.rows.length === 1 && [org, queryResult.rows];
                                });
                            });
                        }).then(ld.spread(function(/*org, transaction*/) {
                            org = arguments[0];
                            transactions = arguments[1];
                        })).then(done, done.fail);
                    });

                    afterEach(function(done) {
                        Promise.all([
                            deleteCampaign(campaign2)
                        ]).then(done, done.fail);
                    });

                    it('should give the org a paymentPlanStart of now', function() {
                        expect(moment(org.paymentPlanStart).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').format());
                    });

                    it('should set the org\'s nextPaymentDate to one month in the future', function() {
                        expect(moment(org.nextPaymentDate).utcOffset(0).format()).toBe(moment(now).utcOffset(0).add(1, 'month').startOf('day').format());
                    });

                    it('should charge the user for their payment plan', function() {
                        const transaction = ld.find(transactions, { paymentplan_id: paymentPlan.id });

                        expect(transaction).toEqual(jasmine.objectContaining({
                            rec_key: jasmine.any(String),
                            rec_ts: jasmine.any(Date),
                            transaction_id: jasmine.any(String),
                            transaction_ts: jasmine.any(Date),
                            org_id: org.id,
                            amount: '149.9900',
                            sign: 1,
                            units: 1,
                            campaign_id: null,
                            braintree_id: jasmine.any(String),
                            promotion_id: null,
                            description: '{"eventType":"credit","source":"braintree"}',
                            view_target: paymentPlan.viewsPerMonth,
                            cycle_end: jasmine.any(Date),
                            cycle_start: jasmine.any(Date),
                            paymentplan_id: paymentPlan.id,
                            application: 'showcase'
                        }));

                        expect(moment(transaction.cycle_start).utcOffset(0).format()).toBe(moment(now).utcOffset(0).startOf('day').format(), 'cycle_start is incorrect');
                        expect(moment(transaction.cycle_end).utcOffset(0).format()).toBe(moment(now).utcOffset(0).add(1, 'month').subtract(1, 'day').endOf('day').format(), 'cycle_end is incorrect');
                    });
                });
            });
        });
    });
});
