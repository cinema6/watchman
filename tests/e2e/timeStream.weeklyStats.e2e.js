'use strict';

const Configurator = require('../helpers/Configurator.js');
const ld = require('lodash');
const moment = require('moment');
const rcKinesis = require('rc-kinesis');
const testUtils = require('cwrx/test/e2e/testUtils.js');
const uuid = require('rc-uuid');

const API_ROOT = process.env.apiRoot;
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const PREFIX = process.env.appPrefix;
const TIME_STREAM = process.env.timeStream;

describe('timeStream weeklyStats', function() {
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
                    users: {
                        endpoint: '/api/account/users'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    analytics: {
                        endpoint: '/api/analytics'
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

    beforeEach(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

        const campaignId = `cam-${uuid.createUuid()}`;
        const orgId = `o-${uuid.createUuid()}`;
        const userId = `u-${uuid.createUuid()}`;

        const today = offset => {
            const dt = new Date(((new Date()).toISOString()).substr(0,10) + 'T00:00:00.000Z');
            return (new Date(dt.valueOf() + (86400000 * (offset || 0)))).toISOString().substr(0,10);
        };

        const supplyMockPostgresData = () => {
            const testSummaries = [
                // Day 1 Stats
                `(\'${today(-7)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-7)} 00:00:00+00\',\'${campaignId}\',\'completedView\',270,0.0000)`,
                `(\'${today(-7)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-7)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',15,0.0000)`,
                `(\'${today(-7)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`,
                // Day 2 Stats
                `(\'${today(-6)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-6)} 00:00:00+00\',\'${campaignId}\',\'completedView\',283,0.0000)`,
                `(\'${today(-6)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-6)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',16,0.0000)`,
                `(\'${today(-6)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`,
                // Day 3 Stats
                `(\'${today(-5)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-5)} 00:00:00+00\',\'${campaignId}\',\'completedView\',245,0.0000)`,
                `(\'${today(-5)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-5)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',3,0.0000)`,
                `(\'${today(-5)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`,
                // Day 4 Stats
                `(\'${today(-4)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-4)} 00:00:00+00\',\'${campaignId}\',\'completedView\',433,0.0000)`,
                `(\'${today(-4)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-4)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',50,0.0000)`,
                `(\'${today(-4)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`,
                // Day 5 Stats
                `(\'${today(-3)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-3)} 00:00:00+00\',\'${campaignId}\',\'completedView\',250,0.0000)`,
                `(\'${today(-3)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-3)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',13,0.0000)`,
                `(\'${today(-3)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`,
                // Day 6 Stats
                `(\'${today(-2)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-2)} 00:00:00+00\',\'${campaignId}\',\'completedView\',125,0.0000)`,
                `(\'${today(-2)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-2)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',3,0.0000)`,
                `(\'${today(-2)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`,
                // Day 7 Stats
                `(\'${today(-1)} 00:00:00+00\',\'${campaignId}\',\'cardView\',0,0.0000)`,
                `(\'${today(-1)} 00:00:00+00\',\'${campaignId}\',\'completedView\',193,0.0000)`,
                `(\'${today(-1)} 00:00:00+00\',\'${campaignId}\',\'unique_user_view\',0,0.0000)`,
                `(\'${today(-1)} 00:00:00+00\',\'${campaignId}\',\'link.Action\',15,0.0000)`,
                `(\'${today(-1)} 00:00:00+00\',\'${campaignId}\',\'appLaunch\',0,0.0000)`
            ];
            const testViews = [
                `(\'${today(-7)}\',\'${campaignId}\',210)`,
                `(\'${today(-6)}\',\'${campaignId}\',221)`,
                `(\'${today(-5)}\',\'${campaignId}\',195)`,
                `(\'${today(-4)}\',\'${campaignId}\',395)`,
                `(\'${today(-3)}\',\'${campaignId}\',200)`,
                `(\'${today(-2)}\',\'${campaignId}\',175)`,
                `(\'${today(-1)}\',\'${campaignId}\',125)`
            ];
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
        this.mockCampaign = {
            id: campaignId,
            org: orgId,
            status: 'active',
            application: 'showcase'
        };
        this.updateCampaign = campaign => {
            return testUtils.resetCollection('campaigns', [campaign]);
        };
        const mockOrg = {
            id: orgId
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
        Promise.all([
            testUtils.resetCollection('orgs', [mockOrg]),
            testUtils.resetCollection('users', [mockUser]),
            supplyMockPostgresData(),
            this.mailman.start()
        ]).then(done, done.fail);
    });

    afterEach(function(done) {
        this.mailman.removeAllListeners();
        this.mailman.stop();
        testUtils.closeDbs().then(() => {
            return new Promise(resolve => setTimeout(resolve, 0));
        }).then(done, done.fail);
    });

    it('should not send a weekly stats email if the campaign is not a week old', function(done) {
        this.mockCampaign.created = moment().subtract(6, 'days').toDate();
        this.updateCampaign(this.mockCampaign).then(() => {
            return this.produceRecord();
        }).then(() => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => resolve(), 5000);
                this.mailman.once(this.statsSubject, () => {
                    clearTimeout(timeout);
                    reject(new Error('Should not have sent an email'));
                });
            });
        }).then(done, done.fail);
    });

    it('should send a weekly stats email when the campaign is a week old', function(done) {
        this.mockCampaign.created = moment().subtract(1, 'week').toDate();
        this.updateCampaign(this.mockCampaign).then(() => {
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

    it('should send a weekly stats email when the campaign is two weeks old', function(done) {
        this.mockCampaign.created = moment().subtract(2, 'weeks').toDate();
        this.updateCampaign(this.mockCampaign).then(() => {
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
            contents.forEach(content => expect(content).toMatch(regex));
        }).then(done, done.fail);
    });
});
