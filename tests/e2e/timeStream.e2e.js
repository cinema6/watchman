
'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

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
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
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
                user: 'not-e2e-user',
                org: 'o-selfie'
            },
            {
                id: 'e2e-rc-2',
                title: 'test card 2',
                campaign: {
                    endDate: new Date(3000, 11, 17)
                },
                status: 'active',
                user: 'not-e2e-user',
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
        ];

        var today = ((new Date()).toISOString()).substr(0, 10);
        var pgdata_campaign_summary_hourly = [
            'INSERT INTO rpt.campaign_summary_hourly_all VALUES',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-1\',\'completedView\',0,0),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-2\',\'completedView\',100,100),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-3\',\'completedView\',200,200),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-4\',\'completedView\',300,300),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-5\',\'completedView\',400,400),',
            '(\'' + today + ' 01:00:00+00\',\'e2e-cam-6\',\'completedView\',500,500);'
        ];
        
        function pgTruncate() {
            return pgQuery(pgconn, 'TRUNCATE TABLE rpt.campaign_summary_hourly_all');
        }
        
        function pgInsert() {
            return pgQuery(pgconn, pgdata_campaign_summary_hourly.join(' '));
        }
        
        pgTruncate().then(function() {
            return Q.all([
                pgInsert(),
                testUtils.resetCollection('cards', mockCards),
                testUtils.resetCollection('campaigns', mockCampaigns)
            ]);
        }).then(done).catch(function(error) {
            done.fail(error);
        });
    });

    afterAll(function(done) {
        testUtils.closeDbs().then(done).catch(function(error) {
            done.fail(error);
        });
    });

    it('should expire active or paused campaigns upon reaching their end date', function(done) {
        function waitForEnded() {
            return testUtils.mongoFind('campaigns', { id: 'e2e-cam-1' }).then(function(campaigns) {
                if(campaigns[0].status !== 'expired') {
                    return Q.Promise(function(resolve, reject) {
                        setTimeout(function() {
                            waitForEnded().then(resolve, reject);
                        }, WAIT_TIME);
                    });
                }
            });
        }

        producer.produce({ type: 'hourly' }).then(function() {
            return waitForEnded();
        }).then(function() {
            var ids = ['e2e-cam-1', 'e2e-cam-2', 'e2e-cam-3', 'e2e-cam-4'];
            return testUtils.mongoFind('campaigns', { id: { $in: ids } }, { id: 1 });
        }).then(function(campaigns) {
            expect(campaigns[0].status).toBe('expired');
            expect(campaigns[1].status).toBe('expired');
            expect(campaigns[2].status).toBe('active');
            expect(campaigns[3].status).toBe('draft');
            done();
        }).catch(done.fail);
    });
    
    it('should change the status of active or paused campaigns when reaching their budget',
            function(done) {
        function waitForEnded() {
            return testUtils.mongoFind('campaigns', { id: 'e2e-cam-5' }).then(function(campaigns) {
                if(campaigns[0].status !== 'outOfBudget') {
                    return Q.Promise(function(resolve, reject) {
                        setTimeout(function() {
                            waitForEnded().then(resolve, reject);
                        }, WAIT_TIME);
                    });
                }
            });
        }

        producer.produce({ type: 'hourly' }).then(function() {
            return waitForEnded();
        }).then(function() {
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
