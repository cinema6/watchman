
'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var APP_CREDS = JSON.parse(process.env.appCreds);
var TIME_STREAM = process.env.timeStream;
var WAIT_TIME = 1000;

function pgQuery(conn, statement) {
    var pg = require('pg.js');
    return Q.Promise(function(resolve, reject) {
        pg.connect(conn, function(err, client, done) {
            if(err) {
                reject(err);
            } else {
                client.query(statement, function(err, res) {
                    if(err) {
                        done();
                        reject(err);
                    } else {
                        done();
                        resolve(res);
                    }
                });
            }
        });
    });
}

describe('timeStream', function() {
    var producer;

    beforeAll(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
        producer = new JsonProducer(TIME_STREAM, { region: 'us-east-1' });
        var pgconn = {
            user: 'cwrx',
            password: 'password',
            database: 'campfire_cwrx',
            host: process.env.mongo ? JSON.parse(process.env.mongo).host : '33.33.33.100'
        };
        var mockCards = [
            {
                id: 'e2e-rc-1',
                title: 'test card 1',
                campaign: {
                    endDate: new Date(2000, 11, 17)
                },
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie'
            },
            {
                id: 'e2e-rc-2',
                title: 'test card 2',
                campaign: {
                    endDate: new Date(3000, 11, 17)
                },
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie'
            }
        ];
        var mockCampaigns = [
            // Active, reached end date, under total budget
            {
                id: 'e2e-cam-1',
                name: 'camp 1',
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ],
                pricing: {
                    budget: 300
                }
            },
            // Paused, reached end date, under total budget
            {
                id: 'e2e-cam-2',
                name: 'camp 2',
                status: 'paused',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ],
                pricing: {
                    budget: 300
                }
            },
            // Active, not reached end date, under total budget
            {
                id: 'e2e-cam-3',
                name: 'camp 3',
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                }
            },
            // Draft, reached end date, over total budget
            {
                id: 'e2e-cam-4',
                name: 'camp 4',
                status: 'draft',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ],
                pricing: {
                    budget: 300
                }
            },
            // Active, not reached end date, reached total budget
            {
                id: 'e2e-cam-5',
                name: 'camp 5',
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                }
            },
            // Paused, not reached end date, reached total budget
            {
                id: 'e2e-cam-6',
                name: 'camp 6',
                status: 'paused',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                }
            },
            // outOfBudget, reached end date, reached total budget
            {
                id: 'e2e-cam-7',
                name: 'camp 7',
                status: 'outOfBudget',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ],
                pricing: {
                    budget: 300
                }
            }
        ];
        // The password is a hash of "password"
        var mockUsers = [
            {
                id: 'e2e-user',
                status: 'active',
                email : 'c6e2etester@gmail.com',
                password : '$2a$10$XomlyDak6mGSgrC/g1L7FO.4kMRkj4UturtKSzy6mFeL8QWOBmIWq',
                org: 'e2e-org',
                permissions: {}
            }
        ];
        var mockApp = {
            id: 'app-e2e-watchman',
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
                users: { read: 'all', create: 'all', edit: 'all', delete: 'all' }
            },
            entitlements: {
                'directEditCampaigns': true
            },
            fieldValidation: {
                'campaigns': {
                    'status': {
                        '__allowed': true
                    }
                }
            }
        };

        var today = ((new Date()).toISOString()).substr(0, 10);
        var pgdataCampaignSummaryHourly = [
            'INSERT INTO rpt.campaign_summary_hourly VALUES',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-1\',\'completedView\',0,0),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-2\',\'completedView\',100,100),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-3\',\'completedView\',200,200),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-4\',\'completedView\',300,300),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-5\',\'completedView\',400,400),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-6\',\'completedView\',500,500),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-7\',\'completedView\',600,600);'
        ];

        function pgTruncate() {
            return pgQuery(pgconn, 'TRUNCATE TABLE rpt.campaign_summary_hourly');
        }

        function pgInsert() {
            return pgQuery(pgconn, pgdataCampaignSummaryHourly.join(' '));
        }

        pgTruncate().then(function() {
            return Q.all([
                pgInsert(),
                testUtils.resetCollection('cards', mockCards),
                testUtils.resetCollection('campaigns', mockCampaigns),
                testUtils.resetCollection('users', mockUsers),
                testUtils.mongoUpsert('applications', { key: 'watchman-app' }, mockApp)
            ]);
        }).then(done, done.fail);
    });

    afterAll(function(done) {
        testUtils.closeDbs().then(done).catch(function(error) {
            done.fail(error);
        });
    });

    function waitForTrue(promise) {
        return Q.resolve().then(promise).then(function(value) {
            if(!value) {
                return Q.Promise(function(resolve, reject) {
                    setTimeout(function() {
                        waitForTrue(promise).then(resolve, reject);
                    }, WAIT_TIME);
                });
            }
        });
    }

    describe('the time event prompting campaigns to be fetched', function() {
        beforeAll(function(done) {
            producer.produce({ type: 'hourly' }).then(done, done.fail);
        });

        describe('when an active, paused, or outOfBudget campaign has reached its end date',
                function() {
            it('should change the status to expired', function(done) {
                function waitForStatus() {
                    return waitForTrue(function() {
                        return testUtils.mongoFind('campaigns', { id: 'e2e-cam-1' })
                            .then(function(campaigns) {
                                return (campaigns[0].status === 'expired');
                            });
                    });
                }

                return waitForStatus().then(function() {
                    var ids = ['e2e-cam-1', 'e2e-cam-2', 'e2e-cam-3', 'e2e-cam-4', 'e2e-cam-7'];
                    return testUtils.mongoFind('campaigns', { id: { $in: ids } }, { id: 1 });
                }).then(function(campaigns) {
                    expect(campaigns[0].status).toBe('expired');
                    expect(campaigns[1].status).toBe('expired');
                    expect(campaigns[2].status).toBe('active');
                    expect(campaigns[3].status).toBe('draft');
                    expect(campaigns[4].status).toBe('expired');
                    done();
                }).catch(done.fail);
            });
        });

        describe('when an active or paused campaign has reached its budget', function() {
            it('should change the status to outOfBudget', function(done) {
                function waitForStatus() {
                    return waitForTrue(function() {
                        return testUtils.mongoFind('campaigns', { id: 'e2e-cam-5' })
                            .then(function(campaigns) {
                                return (campaigns[0].status === 'outOfBudget');
                            });
                    });
                }

                return waitForStatus().then(function() {
                    var ids = ['e2e-cam-3', 'e2e-cam-4', 'e2e-cam-5', 'e2e-cam-6'];
                    return testUtils.mongoFind('campaigns', { id: { $in: ids } }, { id: 1 });
                }).then(function(campaigns) {
                    expect(campaigns[0].status).toBe('active');
                    expect(campaigns[1].status).toBe('draft');
                    expect(campaigns[2].status).toBe('outOfBudget');
                    expect(campaigns[3].status).toBe('outOfBudget');
                    done();
                }).catch(done.fail);
            });
        });
    });
});
