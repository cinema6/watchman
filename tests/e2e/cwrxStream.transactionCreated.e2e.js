'use strict';

/* jshint camelcase:false */

var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var testUtils = require('cwrx/test/e2e/testUtils');
var ld = require('lodash');
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var uuid = require('rc-uuid');
var moment = require('moment');
var Status = require('cwrx/lib/enums').Status;

var API_ROOT = process.env.apiRoot;
var APP_CREDS = JSON.parse(process.env.appCreds);
var AWS_CREDS = JSON.parse(process.env.awsCreds);
var CWRX_STREAM = process.env.cwrxStream;

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

/*function wait(time) {
    return waitUntil(function() { return q.delay(time).thenResolve(true); });
}*/

describe('cwrxStream transactionCreated', function() {
    var producer, request;
    var campaigns, targetCampaignIds, otherCampaignIds;
    var targetOrg, transaction;

    function api(endpoint) {
        return resolveURL(API_ROOT, endpoint);
    }

    function transactionCreatedEvent(time) {
        return producer.produce({
            type: 'transactionCreated',
            data: {
                transaction: transaction,
                date: (time || moment()).format()
            }
        });
    }

    beforeAll(function() {
        var awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        request = new CwrxRequest(APP_CREDS);
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
                    pricing: {
                        budget: {
                            __min: 0,
                            __max: Infinity
                        }
                    }
                },
                orgs: {
                    paymentPlanStart: { __allowed: true },
                    paymentPlanId: { __allowed: true },
                    promotions: { __allowed: true }
                }
            }
        };

        targetOrg = createId('o');

        targetCampaignIds = [createId('cam'), createId('cam')];
        campaigns = [
            // Another org's selfie campaign
            {
                id: createId('cam'),
                application: 'selfie',
                status: Status.Paused,
                created: moment().subtract(1, 'year').toDate(),
                lastUpdated: moment().subtract(1, 'month').toDate(),
                pricing: {
                    model: 'cpv',
                    cost: 0.06,
                    budget: 250,
                    dailyLimit: 50
                },
                org: createId('o'),
                advertiserId: createId('a')
            },
            // Another org's showcase campaign
            {
                id: createId('cam'),
                status: Status.Active,
                application: 'showcase',
                created: moment().subtract(1, 'year').toDate(),
                lastUpdated: moment().subtract(1, 'month').toDate(),
                pricing: {
                    model: 'cpv',
                    cost: 0.01,
                    budget: 33,
                    dailyLimit: 2
                },
                org: createId('o'),
                advertiserId: createId('a')
            },
            // Our org's showcase campaign
            {
                id: targetCampaignIds[0],
                status: Status.OutOfBudget,
                application: 'showcase',
                created: moment().subtract(1, 'year').toDate(),
                lastUpdated: moment().subtract(1, 'month').toDate(),
                pricing: {
                    model: 'cpv',
                    cost: 0.01,
                    budget: 3.50,
                    dailyLimit: 2
                },
                org: targetOrg,
                advertiserId: createId('a')
            },
            // Another org's selfie campaign
            {
                id: createId('cam'),
                status: Status.Rejected,
                application: 'selfie',
                created: moment().subtract(1, 'year').toDate(),
                lastUpdated: moment().subtract(1, 'month').toDate(),
                pricing: {
                    model: 'cpv',
                    cost: 0.06,
                    budget: 1000,
                    dailyLimit: 100
                },
                org: createId('o'),
                advertiserId: createId('a')
            },
            // Our org's showcase campaign
            {
                id: targetCampaignIds[1],
                status: Status.OutOfBudget,
                application: 'showcase',
                created: moment().subtract(1, 'year').toDate(),
                lastUpdated: moment().subtract(1, 'month').toDate(),
                pricing: {
                    model: 'cpv',
                    cost: 0.01,
                    budget: 1.25,
                    dailyLimit: 2
                },
                org: targetOrg,
                advertiserId: createId('a')
            }
        ];
        otherCampaignIds = campaigns.map(function(campaign) { return campaign.id; })
            .filter(function(id) { return targetCampaignIds.indexOf(id) < 0; });

        q.all([
            testUtils.resetCollection('applications', [watchmanApp, cwrxApp]),
            testUtils.resetCollection('campaigns', campaigns)
        ]).then(done, done.fail);
    });

    describe('when produced', function() {
        var updatedCampaigns;

        beforeEach(function(done) {
            transaction = {
                id: createId('t'),
                created: new Date().toISOString(),
                transactionTS: new Date().toISOString(),
                amount: 50,
                sign: 1,
                units: 1,
                org: targetOrg,
                campaign: null,
                braintreeId: null,
                promotion: createId('pro'),
                description: null
            };

            transactionCreatedEvent().then(function() {
                return waitUntil(function() {
                    return q.all(targetCampaignIds.map(function(id) {
                        return request.get({
                            url: api('/api/campaigns/' + id),
                            json: true
                        }).spread(function(campaign) {
                            return moment(campaign.lastUpdated).isAfter(moment().subtract(1, 'day')) && campaign;
                        });
                    })).then(function(results) {
                        return results.every(function(result) {
                            return result;
                        }) && results;
                    });
                }).then(function(/*updatedCampaigns*/) {
                    updatedCampaigns = arguments[0];
                });
            }).then(done, done.fail);
        });

        it('should update each showcase campaign for the org', function() {
            expect(updatedCampaigns.length).toBe(targetCampaignIds.length);
            updatedCampaigns.forEach(function(campaign) {
                expect(moment(campaign.lastUpdated).isBefore(moment().subtract(1, 'week'))).toBe(false, 'campaign(' + campaign.id + ') was not updated recently!');
            });
        });

        it('should increase the budget of every showcase campaign', function() {
            updatedCampaigns.forEach(function(campaign) {
                var oldCampaign = ld.find(campaigns, { id: campaign.id });

                expect(campaign.pricing.budget).toBe(oldCampaign.pricing.budget + (transaction.amount / targetCampaignIds.length));
            });
        });

        it('should set every showcase campaign\'s status to active', function() {
            updatedCampaigns.forEach(function(campaign) {
                expect(campaign.status).toBe(Status.Active);
            });
        });

        it('should not update any other campaigns', function(done) {
            q.all(otherCampaignIds.map(function(id) {
                return request.get({
                    url: api('/api/campaigns/' + id),
                    json: true
                }).spread(function(campaign) {
                    expect(moment(campaign.lastUpdated).isBefore(moment().subtract(1, 'week'))).toBe(true, 'campaign(' + campaign.id + ') was updated recently!');
                });
            })).then(done, done.fail);
        });
    });
});
