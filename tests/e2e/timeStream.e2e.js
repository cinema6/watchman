
'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var TIME_STREAM = process.env.timeStream;
var WAIT_TIME = 1000;

describe('timeStream', function() {
    var producer;

    beforeAll(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
        var awsConfig = {
            region: 'us-east-1',
        };
        if(AWS_CREDS) {
            awsConfig.accessKeyId = AWS_CREDS.accessKeyId;
            awsConfig.secretAccessKey = AWS_CREDS.secretAccessKey;
        }
        producer = new JsonProducer(TIME_STREAM, awsConfig);
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
                campaigns: { read: 'all', edit: 'all' },
                cards: { read: 'all', edit: 'all' },
                users: { read: 'all' },
                orgs: { read: 'all', edit: 'all' },
                promotions: { read: 'all' },
                transactions: { create: 'all' }
            },
            entitlements: {
                'directEditCampaigns': true
            },
            fieldValidation: {
                'campaigns': {
                    'status': {
                        '__allowed': true
                    }
                },
                orgs: {
                    promotions: {
                        __allowed: true
                    }
                }
            }
        };

        var today = ((new Date()).toISOString()).substr(0, 10);
        var pgdataBillingTransactions = [
            'INSERT INTO fct.billing_transactions (rec_ts,transaction_ts,transaction_id,',
            '   org_id,campaign_id,sign,units,amount) VALUES',
            '(now(),\'' + today + ' 00:00:00+00\',\'t-1\',\'o1\',\'e2e-cam-1\',-1,0,0),',
            '(now(),\'' + today + ' 00:00:00+00\',\'t-1\',\'o1\',\'e2e-cam-2\',-1,100,100),',
            '(now(),\'' + today + ' 00:00:00+00\',\'t-1\',\'o1\',\'e2e-cam-3\',-1,200,200),',
            '(now(),\'' + today + ' 00:00:00+00\',\'t-1\',\'o1\',\'e2e-cam-4\',-1,300,300),',
            '(now(),\'' + today + ' 00:00:00+00\',\'t-1\',\'o1\',\'e2e-cam-5\',-1,400,400),',
            '(now(),\'' + today + ' 01:00:00+00\',\'t-2\',\'o1\',\'e2e-cam-6\',-1,500,500),',
            '(now(),\'' + today + ' 00:00:00+00\',\'t-3\',\'o2\',\'e2e-cam-7\',-1,600,600);'
        ];

        function pgTruncate() {
            return testUtils.pgQuery('TRUNCATE TABLE fct.billing_transactions');
        }

        function pgInsert() {
            return testUtils.pgQuery(pgdataBillingTransactions.join(' '));
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
