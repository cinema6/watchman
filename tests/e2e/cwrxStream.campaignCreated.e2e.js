'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment');
var BeeswaxClient = require('beeswax-client');
var Hubspot = require('../../lib/Hubspot.js');

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;
var SECRETS = JSON.parse(process.env.secrets);
var HUBSPOT_API_KEY = SECRETS.hubspot.key;
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
    var producer, request, beeswax, mailman, hubspot;
    var user, org, advertiser, promotions, containers, campaign;

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
            paymentPlanStart: moment().format()
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
                }).then(ld.property('0.0'))
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
            if (!campaign.externalCampaigns.beeswax) { return; }

            return beeswax.campaigns.delete(campaign.externalCampaigns.beeswax.externalId);
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
        });
    }

    function createHubspotContactForUser(user) {
        return hubspot.createContact({
            properties: [
                {
                    property: 'email',
                    value: user.email
                },
                {
                    property: 'firstname',
                    value: user.firstName
                },
                {
                    property: 'lastname',
                    value: user.lastName
                },
                {
                    property: 'applications',
                    value: 'apps'
                },
                {
                    property: 'lifecyclestage',
                    value: 'salesqualifiedlead'
                }
            ]
        });
    }

    beforeAll(function(done) {
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
        beeswax = new BeeswaxClient({
            creds: {
                email: 'ops@cinema6.com',
                password: '07743763902206f2b511bead2d2bf12292e2af82'
            }
        });
        hubspot = new Hubspot(HUBSPOT_API_KEY);
        mailman = new testUtils.Mailman();

        q.all([
            mailman.start()
        ]).then(done, done.fail);
    });

    beforeEach(function(done) {
        var self = this;
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
                    },
                    cards: {
                        __length: Infinity
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
            testUtils.resetCollection('promotions', promotions),
            testUtils.resetCollection('containers', containers)
        ]).then(function() {
            return createUser();
        }).spread(function(/*user, org, advertiser*/) {
            user = arguments[0];
            org = arguments[1];
            advertiser = arguments[2];

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

            return q.all([
                testUtils.resetCollection('campaigns', [campaign]),
                createHubspotContactForUser(user).then(function(contact) {
                    self.createdContact = contact.vid;
                })
            ]);
        }).then(done, done.fail);
    });

    afterEach(function(done) {
        var self = this;
        mailman.removeAllListeners();

        q.all([
            deleteCampaign(campaign).then(function() {
                return hubspot.deleteContact(self.createdContact);
            }).then(function() {
                return deleteUser(user);
            })
        ]).then(done, done.fail);
    });

    afterAll(function(done) {
        q.all([
            mailman.stop()
        ]).then(done, done.fail);
    });

    describe('when produced', function() {
        var placements, supportEmails, supportEmail, userEmails, userEmail, hubspotContact;

        beforeEach(function(done) {
            supportEmails = [];
            userEmails = [];
            mailman.on('New Showcase Campaign Started: ' + campaign.name, function(message) {
                supportEmails.push(message);
            });
            mailman.on('Johnny, Welcome to Reelcontent Apps', function(message) {
                userEmails.push(message);
            });

            campaignCreatedEvent().then(function() {
                return waitUntil(function() {
                    return request.get({
                        url: api('/api/campaigns/' + campaign.id),
                        json: true
                    }).spread(function(campaign) {
                        return campaign.cards.length > 0 && campaign;
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
                    supportEmail = ld.find(supportEmails, function(email) {
                        return email.text.indexOf(campaign.externalCampaigns.beeswax.externalId) > -1;
                    });
                    userEmail = ld.find(userEmails, function(email) {
                        return email.text.indexOf(user.firstName) > -1;
                    });
                    return supportEmail && userEmail;
                });
            }).then(function() {
                return waitUntil(function() {
                    return hubspot.getContactByEmail(user.email).then(function(contact) {
                        return contact.properties.lifecyclestage.value === 'customer' ? contact : null;
                    });
                });
            }).then(function(contact) {
                hubspotContact = contact;
            }).then(done, done.fail);
        });

        it('should create a campaign in beeswax', function() {
            expect(campaign.externalCampaigns.beeswax).toEqual(jasmine.objectContaining({
                externalId: jasmine.any(Number)
            }));
        });

        it('should create two cards', function() {
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
            expect(campaign.cards[1]).toEqual(jasmine.objectContaining({
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
        });

        it('should create two placements', function() {
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
            expect(ld.find(placements, { tagType: 'display' })).toEqual(jasmine.objectContaining({
                label: 'Showcase--300x250 for App: "Count Coins"',
                tagType: 'display',
                tagParams: jasmine.objectContaining({
                    container: 'beeswax',
                    type: 'mobile-card',
                    branding: 'showcase-app--300x250',
                    card: campaign.cards[1].id,
                    campaign: campaign.id
                }),
                showInTag: jasmine.objectContaining({}),
                thumbnail: campaign.cards[1].thumbs.small,
                id: jasmine.any(String),
                created: jasmine.any(String),
                lastUpdated: jasmine.any(String),
                status: 'active'
            }));
        });

        it('should send an email to support', function() {
            expect(supportEmail.from[0].address.toLowerCase()).toBe('support@cinema6.com');
            expect(supportEmail.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
            expect(supportEmail.text).toContain('http://stingersbx.beeswax.com/advertisers/' + advertiser.beeswaxIds.advertiser + '/campaigns/' + campaign.externalCampaigns.beeswax.externalId + '/line_items');
        });

        it('should send an email to the user', function() {
            expect(userEmail.from[0].address.toLowerCase()).toBe('support@cinema6.com');
            expect(userEmail.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');
            expect(userEmail.text).toContain('We’ve got your ad');
        });

        it('should update the contact in Hubspot', function() {
            expect(hubspotContact.vid).toBe(this.createdContact);
            expect(hubspotContact.properties.email.value).toBe(user.email);
            expect(hubspotContact.properties.firstname.value).toBe(user.firstName);
            expect(hubspotContact.properties.lastname.value).toBe(user.lastName);
            expect(hubspotContact.properties.applications.value).toBe('apps');
            expect(hubspotContact.properties.lifecyclestage.value).toBe('customer');
        });
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
                    expect(moment(org.nextPaymentDate).isSame(now, 'day')).toBe(true, 'nextPaymentDate is not today.');
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
                    expect(moment(org.nextPaymentDate).isSame(moment(now).add(17, 'days'), 'day')).toBe(true, 'nextPaymentDate is the wrong day.');
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
                        description: JSON.stringify({ eventType: 'credit', source: 'promotion', target: 'showcase', paymentPlanId: org.paymentPlanId })
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
                        description: JSON.stringify({ eventType: 'credit', source: 'promotion', target: 'showcase', paymentPlanId: org.paymentPlanId })
                    }));
                });
            });
        });
    });
});
