'use strict';

var Configurator = require('../helpers/Configurator.js');
var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils.js');

var APP_CREDS = JSON.parse(process.env.appCreds);
var API_ROOT = process.env.apiRoot;
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var PREFIX = process.env.appPrefix;
var TIME_STREAM = process.env.timeStream;
var WATCHMAN_STREAM = process.env.watchmanStream;

// Helpers for creating transaction records in postgres
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

describe('timeStream available funds check', function() {
    var producer, mockman;

    // Helpers to wait for async events
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
                    accounting: {
                        endpoint: '/api/accounting'
                    }
                }
            },
            emails: {
                sender: 'support@cinema6.com'
            },
            postmark: {
                templates: {
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: { }
        };
        const timeConfig = {
            eventHandlers: {
                tenMinutes: {
                    actions: [
                        {
                            name: 'check_available_funds'
                        }
                    ]
                }
            }
        };
        const watchmanConfig = {
            eventHandlers: {
                campaignOutOfFunds: {
                    actions: [
                        {
                            name: 'message/log',
                            options: {
                                text: '[activity] Campaign {{campaign.name}} ({{campaign.id}}) is out of funds',
                                level: 'warn'
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
    beforeAll(function(done) {
        const watchmanApp = {
            id: 'watchman-app',
            key: APP_CREDS.key,
            status: 'active',
            secret: APP_CREDS.secret,
            permissions: {
                campaigns: { read: 'all' },
                cards: { read: 'all' },
                orgs: { read: 'all' }
            },
            entitlements: { },
            fieldValidation: { }
        };
        testUtils.resetCollection('applications', [watchmanApp]).then(done, done.fail);
    });

    beforeAll(function(done) {
        var awsConfig = {
            region: 'us-east-1'
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

    afterAll(function(done) {
        mockman.stop();
        testUtils.closeDbs().then(done, done.fail);
    });

    beforeEach(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
        var mockOrgs = [
            { id: 'o-1', status: 'active', name: 'org 1' },
            { id: 'o-2', status: 'active', name: 'org 2' },
            { id: 'o-3', status: 'active', name: 'org 3' }
        ];
        var mockTransactions = [
            // Negative balance for o-1
            creditRecord('o-1', 500, 'pay-1'),
            debitRecord('o-1', 400, 1, 'cam-o1-1'),
            debitRecord('o-1', 400, 1, 'cam-o1-666'),

            // Positive balance for o-2
            creditRecord('o-2', 6000, 'pay-2'),
            debitRecord('o-2', 1000, 1, 'cam-o2-666')
        ];
        var mockCamps = [
            { id: 'cam-o1-1', org: 'o-1', status: 'active', pricing: { budget: 500 } },
            { id: 'cam-o1-2', org: 'o-1', status: 'active', pricing: { budget: 100 } },
            { id: 'cam-o1-3', org: 'o-1', status: 'paused', pricing: { budget: 500 } },

            { id: 'cam-o2-1', org: 'o-2', status: 'active', pricing: { budget: 9000 } }
        ];

        return Q.all([
            testUtils.resetPGTable('fct.billing_transactions', mockTransactions),
            testUtils.resetCollection('orgs', mockOrgs),
            testUtils.resetCollection('campaigns', mockCamps)
        ])
        .thenResolve().then(done, done.fail);
    });

    it('should produce campaignOutOfFunds events for active campaigns from orgs that are out of funds', function(done) {
        producer.produce({ type: 'tenMinutes', data: { date: new Date() } }).then(function() {
            return waitForMockman('campaignOutOfFunds', 2).then(function(records) {
                var campIds = records.map(function(record) { return record.data.campaign.id; }).sort();
                expect(campIds).toEqual(['cam-o1-1', 'cam-o1-2']);
            });
        })
        .then(done, done.fail);
    });

    it('should skip active campaigns that have no budget', function(done) {
        testUtils.resetCollection('campaigns', [
            { id: 'cam-o1-10', org: 'o-1', status: 'active', pricing: {} },
            { id: 'cam-o1-20', org: 'o-1', status: 'active' },
            { id: 'cam-o1-30', org: 'o-1', status: 'active', pricing: { budget: 600 } },
            { id: 'cam-o1-40', org: 'o-1', status: 'active', pricing: { budget: 200 } }
        ]).then(function() {
            return producer.produce({ type: 'tenMinutes', data: { date: new Date() } });
        }).then(function() {
            return waitForMockman('campaignOutOfFunds', 2).then(function(records) {
                var campIds = records.map(function(record) { return record.data.campaign.id; }).sort();
                expect(campIds).toEqual(['cam-o1-30', 'cam-o1-40']);
            });
        })
        .then(done, done.fail);
    });

    afterEach(function() {
        mockman.removeAllListeners();
    });
});
