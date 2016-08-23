'use strict';

const Configurator = require('../helpers/Configurator.js');
const ld = require('lodash');
const moment = require('moment');
const rcKinesis = require('rc-kinesis');
const testUtils = require('cwrx/test/e2e/testUtils.js');
const uuid = require('rc-uuid');

const APP_CREDS = JSON.parse(process.env.appCreds);
const API_ROOT = process.env.apiRoot;
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const PREFIX = process.env.appPrefix;
const TIME_STREAM = process.env.timeStream;
const WATCHMAN_STREAM = process.env.watchmanStream;

describe('timeStream weeklyStats', function () {
    // This beforeAll is dedicated to setting application config
    beforeAll(function (done) {
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
                    users: {
                        endpoint: '/api/account/users'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
                    },
                    transactions: {
                        endpoint: '/api/transactions'
                    },
                    paymentPlans: {
                        endpoint: '/api/payment-plans'
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
                    'weeklyStats1': '822221',
                    'weeklyStatsDefault': '844202'
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
                noon_orgPulse: {
                    actions: [
                        {
                            name: 'check_weekiversary'
                        }
                    ]
                },
                campaign_weekiversary: {
                    actions: [
                        {
                            name: 'message/campaign_email',
                            options: {
                                type: 'stats'
                            },
                            ifData: {
                                'campaign.application': '^showcase$'
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
    beforeAll(function (done) {
        const watchmanApp = {
            id: 'watchman-app',
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all' },
                cards: { read: 'all' },
                orgs: { read: 'all' },
                users: { read: 'all' },
                transactions: { read: 'all' }
            },
            entitlements: { },
            fieldValidation: { }
        };
        testUtils.resetCollection('applications', [watchmanApp]).then(done, done.fail);
    });

    beforeAll(function (done) {
        this.mockman = new testUtils.Mockman({
            streamName: WATCHMAN_STREAM
        });
        this.mockman.start().then(done, done.fail);
    });

    afterAll(function () {
        this.mockman.stop();
    });

    beforeEach(function (done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

        const campaignIds = [`cam-${uuid.createUuid()}`, `cam-${uuid.createUuid()}`];
        const orgId = `o-${uuid.createUuid()}`;
        const userId = `u-${uuid.createUuid()}`;
        const paymentPlanId = `pp-${uuid.createUuid()}`;

        const today = offset => {
            const dt = new Date(((new Date()).toISOString()).substr(0,10) + 'T00:00:00.000Z');
            return (new Date(dt.valueOf() + (86400000 * (offset || 0)))).toISOString().substr(0,10);
        };

        const supplyMockPostgresData = campaigns => {
            let testSummaries = [ ];
            let testViews = [ ];

            campaigns.forEach(campaign => {
                const testSummary = [
                    // Day 1 Stats
                    `(\'${today(-7)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-7)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',270,0.0000)`,
                    `(\'${today(-7)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-7)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',15,0.0000)`,
                    `(\'${today(-7)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`,
                    // Day 2 Stats
                    `(\'${today(-6)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-6)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',283,0.0000)`,
                    `(\'${today(-6)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-6)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',16,0.0000)`,
                    `(\'${today(-6)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`,
                    // Day 3 Stats
                    `(\'${today(-5)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-5)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',245,0.0000)`,
                    `(\'${today(-5)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-5)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',3,0.0000)`,
                    `(\'${today(-5)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`,
                    // Day 4 Stats
                    `(\'${today(-4)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-4)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',433,0.0000)`,
                    `(\'${today(-4)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-4)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',50,0.0000)`,
                    `(\'${today(-4)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`,
                    // Day 5 Stats
                    `(\'${today(-3)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-3)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',250,0.0000)`,
                    `(\'${today(-3)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-3)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',13,0.0000)`,
                    `(\'${today(-3)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`,
                    // Day 6 Stats
                    `(\'${today(-2)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-2)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',125,0.0000)`,
                    `(\'${today(-2)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-2)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',3,0.0000)`,
                    `(\'${today(-2)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`,
                    // Day 7 Stats
                    `(\'${today(-1)} 00:00:00+00\',\'${campaign.id}\',\'cardView\',0,0.0000)`,
                    `(\'${today(-1)} 00:00:00+00\',\'${campaign.id}\',\'completedView\',193,0.0000)`,
                    `(\'${today(-1)} 00:00:00+00\',\'${campaign.id}\',\'unique_user_view\',0,0.0000)`,
                    `(\'${today(-1)} 00:00:00+00\',\'${campaign.id}\',\'link.Action\',15,0.0000)`,
                    `(\'${today(-1)} 00:00:00+00\',\'${campaign.id}\',\'appLaunch\',0,0.0000)`
                ];
                const testView = [
                    `(\'${today(-7)}\',\'${campaign.id}\',210)`,
                    `(\'${today(-6)}\',\'${campaign.id}\',221)`,
                    `(\'${today(-5)}\',\'${campaign.id}\',195)`,
                    `(\'${today(-4)}\',\'${campaign.id}\',395)`,
                    `(\'${today(-3)}\',\'${campaign.id}\',200)`,
                    `(\'${today(-2)}\',\'${campaign.id}\',175)`,
                    `(\'${today(-1)}\',\'${campaign.id}\',125)`
                ];

                testSummaries = testSummaries.concat(testSummary);
                testViews = testViews.concat(testView);
            });

            return Promise.all([
                testUtils.resetPGTable('rpt.campaign_summary_hourly', testSummaries),
                testUtils.resetPGTable('rpt.unique_user_views_daily', testViews)
            ]);
        };
        const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});
        const producer = new rcKinesis.JsonProducer(TIME_STREAM, awsConfig);
        this.produceRecord = () => {
            return producer.produce({
                type: 'hourly',
                data: {
                    hour: 12,
                    date: new Date()
                }
            });
        };
        this.mockCampaigns = [{
            id: campaignIds[0],
            org: orgId,
            status: 'active',
            application: 'showcase',
            name: 'The Best App',
            created: moment().toDate()
        }, {
            id: campaignIds[1],
            org: orgId,
            status: 'active',
            application: 'showcase',
            name: 'The Worst App',
            created: moment().toDate()
        }];
        this.updateCampaigns = campaigns => {
            return supplyMockPostgresData(campaigns).then(() =>
                testUtils.resetCollection('campaigns', campaigns));
        };
        this.mockOrg = {
            id: orgId,
            paymentPlanId: paymentPlanId
        };
        const mockUser = {
            id: userId,
            org: orgId,
            email: 'c6e2etester@gmail.com',
            firstName: 'Patrick',
            lastName: 'Star'
        };
        this.mailman = new testUtils.Mailman();
        this.mailman.on('error', error => {
            throw new Error(error);
        });
        this.statsSubject = 'Patrick, Wondering How Your Ad is Doing?';
        this.weekiversaryEvent = 'campaign_weekiversary';
        Promise.all([
            testUtils.resetCollection('orgs', [this.mockOrg]),
            testUtils.resetCollection('users', [mockUser]),
            this.mailman.start()
        ]).then(done, done.fail);
    });

    // Mock relevent Postgres data
    beforeEach(function (done) {
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
            creditRecordShowcase(this.mockOrg.id, 49.99, 'pay13',null,null,2000,'plan9','showcase',
                    'current_timestamp - \'30 days\'::interval',
                    'current_timestamp - \'30 days\'::interval',
                    'current_timestamp'),
            creditRecordShowcase(this.mockOrg.id, 59.99, 'pay14',null,null,3000,'plan9','showcase',
                    'current_timestamp','current_timestamp',
                    'current_timestamp + \'30 days\'::interval'),
            creditRecordShowcase(this.mockOrg.id, 59.99, 'pay14','promo1',null,400,null,'showcase',
                    'current_timestamp - \'10 days\'::interval'),
            creditRecordShowcase(this.mockOrg.id, 59.99, 'pay14','promo1',null,500,null,'showcase',
                    'current_timestamp + \'10 days\'::interval'),
            creditRecordShowcase(this.mockOrg.id, 59.99, 'pay14','promo1',null,600,null,'showcase',
                    'current_timestamp + \'15 days\'::interval'),
            creditRecordShowcase(this.mockOrg.id, 59.99, 'pay14','promo1',null,500,null,'showcase',
                    'current_timestamp + \'10 days\'::interval')
        ];

        testUtils.resetPGTable('fct.billing_transactions', testTransactions, null, transFields).then(done, done.fail);
    });

    afterEach(function (done) {
        this.mockman.removeAllListeners();
        this.mailman.removeAllListeners();
        this.mailman.stop();
        testUtils.closeDbs().then(() => {
            return new Promise(resolve => setTimeout(resolve, 0));
        }).then(done, done.fail);
    });

    it('should not send a weekly stats email if the campaign is not a week old', function (done) {
        this.mockCampaigns[0].created = moment().subtract(6, 'days').toDate();
        this.updateCampaigns(this.mockCampaigns).then(() => {
            return this.produceRecord();
        }).then(() => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => resolve(), 5000);
                this.mockman.once(this.weekiversaryEvent, () => {
                    clearTimeout(timeout);
                    reject(new Error(`Should not have produced ${this.weekiversaryEvent}`));
                });
            });
        }).then(done, done.fail);
    });

    it('should send a weekly stats email when the campaign is a week old', function (done) {
        this.mockCampaigns[0].created = moment().subtract(1, 'week').toDate();
        this.updateCampaigns(this.mockCampaigns).then(() => {
            return Promise.all([
                new Promise(resolve => this.mailman.once(this.statsSubject, email => resolve(email))),
                this.produceRecord()
            ]);
        }).then(results => {
            const email = results[0];
            const regex = /Patrick, it's only been a few days/;

            expect(email.from[0].address.toLowerCase()).toBe('support@cinema6.com');
            expect(email.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');

            const contents = [email.html, email.text];
            contents.forEach(content => {
                expect(content).toMatch(regex);
                expect(content).toContain(moment().subtract(1, 'day').format('MMM D, YYYY'));
                expect(content).toContain(moment().subtract(1, 'week').format('MMM D, YYYY'));
                expect(content).toContain(1521);
                expect(content).toContain(115);
                expect(content).toContain('7.56%');
            });
        }).then(done, done.fail);
    });

    it('should send a weekly stats email when the campaign is two weeks old', function (done) {
        this.mockCampaigns[0].created = moment().subtract(2, 'weeks').toDate();
        this.updateCampaigns(this.mockCampaigns).then(() => {
            return Promise.all([
                new Promise(resolve => this.mailman.once(this.statsSubject, email => resolve(email))),
                this.produceRecord()
            ]);
        }).then(results => {
            const email = results[0];
            const regex = /Patrick, your ads have been hard at work./;

            expect(email.from[0].address.toLowerCase()).toBe('support@cinema6.com');
            expect(email.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');

            const contents = [email.html, email.text];
            contents.forEach(content => expect(content).toMatch(regex));
        }).then(done, done.fail);
    });

    it('should not send a weekly stats emails if the org does not have a payment plan', function (done) {
        this.mockOrg.paymentPlanId = null;
        this.mockCampaigns[0].created = moment().subtract(1, 'week').toDate();
        Promise.all([
            testUtils.resetCollection('orgs', [this.mockOrg]),
            this.updateCampaigns(this.mockCampaigns),
            testUtils.resetPGTable('fct.billing_transactions')
        ]).then(() => {
            return this.produceRecord();
        }).then(() => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => resolve(), 5000);
                this.mockman.once(this.weekiversaryEvent, () => {
                    clearTimeout(timeout);
                    reject(new Error(`Should not have produced ${this.weekiversaryEvent}`));
                });
            });
        }).then(done, done.fail);
    });

    it('should be able to send a weekly stats email containing stats for multiple apps', function (done) {
        this.mockCampaigns[0].created = moment().subtract(2, 'weeks').toDate();
        this.updateCampaigns(this.mockCampaigns).then(() => {
            return Promise.all([
                new Promise(resolve => this.mailman.once(this.statsSubject, email => resolve(email))),
                this.produceRecord()
            ]);
        }).then(results => {
            const email = results[0];
            const regex = /Patrick, your ads have been hard at work./;

            expect(email.from[0].address.toLowerCase()).toBe('support@cinema6.com');
            expect(email.to[0].address.toLowerCase()).toBe('c6e2etester@gmail.com');

            const contents = [email.html, email.text];
            contents.forEach(content => {
                expect(content).toMatch(regex);
                expect(content).toContain(moment().subtract(1, 'day').format('MMM D, YYYY'));
                expect(content).toContain(moment().subtract(1, 'week').format('MMM D, YYYY'));
                expect(content).toContain('The Best App');
                expect(content).toContain('The Worst App');
                expect(content.match(/\D1521/g).length).toBe(2); // individual views
                expect(content.match(/\D115/g).length).toBe(2); // individual clicks
                expect(content.match(/\D3042/g).length).toBe(1); // total views
                expect(content.match(/\D230/g).length).toBe(1); // total clicks
                expect(content.match(/\D7\.56%/g).length).toBe(3); // cpv
            });
        }).then(done, done.fail);
    });
});
