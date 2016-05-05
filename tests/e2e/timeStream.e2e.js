
'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var TIME_STREAM = process.env.timeStream;
var WAIT_TIME = 1000;
var WATCHMAN_STREAM = process.env.watchmanStream;

describe('timeStream', function() {
    var producer, mockman;

    beforeAll(function(done) {
        var awsConfig = {
            region: 'us-east-1',
        };
        if(AWS_CREDS) {
            awsConfig.accessKeyId = AWS_CREDS.accessKeyId;
            awsConfig.secretAccessKey = AWS_CREDS.secretAccessKey;
        }
        producer = new JsonProducer(TIME_STREAM, awsConfig);
        mockman = new testUtils.Mockman({
            streamName: WATCHMAN_STREAM
        });
        mockman.start().then(done, done.fail);
    });

    afterAll(function() {
        mockman.stop();
    });

    beforeEach(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
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
                id: 'e2e-cam-01',
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
                id: 'e2e-cam-02',
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
                id: 'e2e-cam-03',
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
                id: 'e2e-cam-04',
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
                id: 'e2e-cam-05',
                name: 'camp 5',
                status: 'active',
                user: 'e2e-user',
                org: 'o-reelcontent',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                }
            },
            // Paused, not reached end date, reached total budget
            {
                id: 'e2e-cam-06',
                name: 'camp 6',
                status: 'paused',
                user: 'e2e-user',
                org: 'o-reelcontent',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                }
            },
            // outOfBudget, reached end date, reached total budget
            {
                id: 'e2e-cam-07',
                name: 'camp 7',
                status: 'outOfBudget',
                user: 'e2e-user',
                org: 'o-reelcontent',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ],
                pricing: {
                    budget: 300
                }
            },
            // Active, not reached end date, not reached total budget
            {
                id: 'e2e-cam-08',
                name: 'camp 8',
                status: 'active',
                user: 'e2e-user',
                org: 'o-new',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                }
            },
            // Active, reached end date, has update request
            {
                id: 'e2e-cam-09',
                name: 'camp 9',
                status: 'active',
                user: 'e2e-user',
                org: 'o-reelcontent',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ],
                pricing: {
                    budget: 300
                },
                updateRequest: 'ur-cam-9'
            },
            // Active, reached total budget, has update request
            {
                id: 'e2e-cam-10',
                name: 'camp 10',
                status: 'active',
                user: 'e2e-user',
                org: 'o-reelcontent',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ],
                pricing: {
                    budget: 300
                },
                updateRequest: 'ur-cam-10'
            }
        ];
        var mockUpdateRequests = [
            {
                id: 'ur-cam-9',
                status: 'pending',
                data: {
                    id: 'e2e-cam-09',
                    name: 'camp 9',
                    status: 'active',
                    user: 'e2e-user',
                    org: 'o-reelcontent',
                    advertiserId: 'advertiser',
                    cards: [ { id: 'e2e-rc-1', campaignId: 'e2e-cam-09' } ],
                    pricing: {
                        budget: 300
                    }
                }
            },
            {
                id: 'ur-cam-10',
                status: 'pending',
                data: {
                    id: 'e2e-cam-10',
                    name: 'camp 10',
                    status: 'active',
                    user: 'e2e-user',
                    org: 'o-reelcontent',
                    advertiserId: 'advertiser',
                    cards: [ { id: 'e2e-rc-2', campaignId: 'e2e-cam-10' } ],
                    pricing: {
                        budget: 300
                    }
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
        var mockOrgs = [
            {
                id: 'o-selfie',
                name: 'Selfie Org',
                status: 'active'
            },
            {
                id: 'o-reelcontent',
                name: 'Reelcontent Org',
                status: 'active'
            },
            {
                id: 'o-new',
                name: 'Brand New Org',
                status: 'active'
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
                transactions: { create: 'all' },
                campaignUpdates: { edit: 'all' }
            },
            entitlements: {
                directEditCampaigns: true
            },
            fieldValidation: {
                campaigns: {
                    status: { __allowed: true }
                },
                orgs: {
                    promotions: { __allowed: true }
                },
                campaignUpdates: {
                    status: { __allowed: true },
                    rejectionReason: { __allowed: true }
                }
            }
        };

        var transCounter = 9999;

        function creditRecord(org, amount, braintreeId, promotion) {
            var recKey = transCounter++,
                id = 't-e2e-' + String(recKey),
                desc = '';

            braintreeId = braintreeId || '';
            promotion = promotion || '';

            return '(' + recKey + ',\'2016-03-21T15:53:11.927Z\',\'' + id + '\',\'2016-03-21T15:53:11.927Z\',\'' +
                   org + '\',' + amount + ',1,1,\'\',\'' + braintreeId + '\',\'' + promotion + '\',\'' + desc + '\')';
        }

        function debitRecord(org, amount, units, campaign) {
            var recKey = transCounter++,
                id = 't-e2e-' + String(recKey),
                desc = '';

            units = units || 1;
            campaign = campaign || '';

            return '(' + recKey + ',\'2016-03-21T15:53:11.927Z\',\'' + id + '\',\'2016-03-21T15:53:11.927Z\',\'' +
                   org + '\',' + amount + ',-1,' + units + ',\'' + campaign + '\',\'\',\'\',\'' + desc + '\')';
        }

        function pgTruncate() {
            return testUtils.pgQuery('TRUNCATE TABLE fct.billing_transactions');
        }

        var testTransactions = [
            debitRecord('o-selfie', 100, 100, 'e2e-cam-02'),
            debitRecord('o-selfie', 200, 200, 'e2e-cam-03'),
            debitRecord('o-selfie', 300, 300, 'e2e-cam-04'),
            creditRecord('o-reelcontent', 5000, 'pay-1'),
            debitRecord('o-reelcontent', 400, 400, 'e2e-cam-05'),
            debitRecord('o-reelcontent', 500, 500, 'e2e-cam-06'),
            debitRecord('o-reelcontent', 600, 600, 'e2e-cam-07'),
            debitRecord('o-reelcontent', 900, 900, 'e2e-cam-10')
        ];

        pgTruncate().then(function() {
            return Q.all([
                testUtils.resetPGTable('fct.billing_transactions', testTransactions),
                testUtils.resetCollection('cards', mockCards),
                testUtils.resetCollection('campaigns', mockCampaigns),
                testUtils.resetCollection('campaignUpdates', mockUpdateRequests),
                testUtils.resetCollection('users', mockUsers),
                testUtils.resetCollection('orgs', mockOrgs),
                testUtils.mongoUpsert('applications', { key: 'watchman-app' }, mockApp)
            ]);
        }).then(done, done.fail);
    });

    afterAll(function(done) {
        mockman.stop();
        testUtils.closeDbs().then(done, done.fail);
    });

    afterEach(function() {
        mockman.removeAllListeners();
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

    function waitForStatus(ids, status) {
        return waitForTrue(function() {
            return testUtils.mongoFind('campaigns', { id: { $in: ids } }, { id: 1 }).then(function(campaigns) {
                return campaigns.every(function(campaign) {
                    return (campaign.status === status);
                });
            });
        });
    }

    function waitForMockman(eventType, n) {
        var records = [];
        return Q.Promise(function(resolve) {
            mockman.on(eventType, function(record) {
                records.push(record);
                if(records.length === n) {
                    resolve(records);
                }
            });
        });
    }

    describe('the time event prompting campaigns to be fetched', function() {
        beforeEach(function(done) {
            producer.produce({ type: 'hourly', data: { date: new Date() } }).then(done, done.fail);
        });

        describe('when an active, paused, or outOfBudget campaign has reached its end date', function() {
            beforeEach(function(done) {
                var promises = [
                    waitForStatus(['e2e-cam-01', 'e2e-cam-02', 'e2e-cam-07', 'e2e-cam-09'], 'expired'),
                    waitForMockman('campaignOutOfFunds', 3)
                ];
                Q.all(promises).then(done, done.fail);
            });

            it('should change the status to expired', function(done) {
                var ids = ['e2e-cam-01', 'e2e-cam-02', 'e2e-cam-03', 'e2e-cam-04', 'e2e-cam-07', 'e2e-cam-09'];
                return testUtils.mongoFind('campaigns', { id: { $in: ids } }, { id: 1 }).then(function(campaigns) {
                    expect(campaigns[0].status).toBe('expired');
                    expect(campaigns[1].status).toBe('expired');
                    expect(campaigns[2].status).toBe('active');
                    expect(campaigns[3].status).toBe('draft');
                    expect(campaigns[4].status).toBe('expired');
                    expect(campaigns[5].status).toBe('expired');
                }).then(done, done.fail);
            });

            it('should reject a pending update request before changing the status', function(done) {
                return testUtils.mongoFind('campaignUpdates', { id: 'ur-cam-9' }).then(function(results) {
                    var updateRequest = results[0];
                    expect(updateRequest.status).toBe('rejected');
                    expect(updateRequest.rejectionReason).toContain('Your campaign has expired');
                    expect(updateRequest.campaignExpired).toBe(true);
                }).then(done, done.fail);
            });
        });

        describe('when an active or paused campaign has reached its budget', function() {
            beforeEach(function(done) {
                var promises = [
                    waitForStatus(['e2e-cam-05', 'e2e-cam-06', 'e2e-cam-10'], 'outOfBudget'),
                    waitForMockman('campaignOutOfFunds', 3)
                ];
                Q.all(promises).then(done, done.fail);
            });

            it('should change the status to outOfBudget', function(done) {
                var ids = ['e2e-cam-03', 'e2e-cam-04', 'e2e-cam-05', 'e2e-cam-06', 'e2e-cam-10'];
                return testUtils.mongoFind('campaigns', { id: { $in: ids } }, { id: 1 }).then(function(campaigns) {
                    expect(campaigns[0].status).toBe('active');
                    expect(campaigns[1].status).toBe('draft');
                    expect(campaigns[2].status).toBe('outOfBudget');
                    expect(campaigns[3].status).toBe('outOfBudget');
                    expect(campaigns[4].status).toBe('outOfBudget');
                }).then(done, done.fail);
            });

            it('should reject a pending update request before changing the status', function(done) {
                return testUtils.mongoFind('campaignUpdates', { id: 'ur-cam-10' }).then(function(results) {
                    var updateRequest = results[0];
                    expect(updateRequest.status).toBe('rejected');
                    expect(updateRequest.rejectionReason).toContain('Your campaign has exhausted its budget');
                    expect(updateRequest.campaignExpired).toBe(true);
                }).then(done, done.fail);
            });
        });

        describe('when an org has a non positive balance', function() {
            it('should produce a campaignOutOfFunds event for each active campaign in the org', function(done) {
                waitForMockman('campaignOutOfFunds', 3).then(function(records) {
                    var campaignIds = records.map(function(record) {
                        return record.data.campaign.id;
                    });
                    ['e2e-cam-01', 'e2e-cam-03', 'e2e-cam-08'].forEach(function(id) {
                        expect(campaignIds).toContain(id);
                    });
                }).then(done, done.fail);
            });
        });
    });
});
