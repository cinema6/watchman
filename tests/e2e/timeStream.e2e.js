
'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var TIME_STREAM = 'devTimeStream';
var WAIT_TIME = 1000;

describe('timeStream', function() {
    var producer;
    
    beforeAll(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
        producer = new JsonProducer(TIME_STREAM, { region: 'us-east-1' });
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
            {
                id: 'e2e-cam-1',
                name: 'camp 1',
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ]
            },
            {
                id: 'e2e-cam-2',
                name: 'camp 2',
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ]
            },
            {
                id: 'e2e-cam-3',
                name: 'camp 3',
                status: 'active',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-2' } ]
            },
            {
                id: 'e2e-cam-4',
                name: 'camp 4',
                status: 'draft',
                user: 'e2e-user',
                org: 'o-selfie',
                advertiserId: 'advertiser',
                cards: [ { id: 'e2e-rc-1' } ]
            }
        ];
        Q.all([
            testUtils.resetCollection('cards', mockCards),
            testUtils.resetCollection('campaigns', mockCampaigns)
        ]).then(done).catch(function(error) {
            done.fail(error);
        });
    });
    
    it('should expire active campaigns upon reaching their end date', function(done) {
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
            return Q.all([
                testUtils.mongoFind('campaigns', { id: 'e2e-cam-1' }),
                testUtils.mongoFind('campaigns', { id: 'e2e-cam-2' }),
                testUtils.mongoFind('campaigns', { id: 'e2e-cam-3' }),
                testUtils.mongoFind('campaigns', { id: 'e2e-cam-4' })
            ]);
        }).then(function(results) {
            var campaigns = results.map(function(result) {
                return result[0];
            });
            expect(campaigns[0].status).toBe('expired');
            expect(campaigns[1].status).toBe('expired');
            expect(campaigns[2].status).toBe('active');
            expect(campaigns[3].status).toBe('draft');
            done();
        }).catch(function(error) {
            done.fail(error);
        });
    });
    
    afterAll(function(done) {
        testUtils.closeDbs().then(done).catch(function(error) {
            done.fail(error);
        });
    });
});
