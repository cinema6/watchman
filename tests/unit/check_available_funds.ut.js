'use strict';

var Q = require('q');
var proxyquire = require('proxyquire');
var url = require('url');
var MockObjectStore = require('../helpers/MockObjectStore.js');
var MockObjectStream = require('../helpers/MockObjectStream.js');

var CwrxEntities;
var CwrxRequest;
var JsonProducer;
var factory;

describe('check_available_funds', function() {
    var mockConfig, action, mockStreams, mockObjectStore, balanceResp;

    beforeEach(function() {
        mockConfig = {
            appCreds: 'appCreds',
            cwrx: {
                api: {
                    root: 'https://apiroot.com',
                    accounting: {
                        endpoint: '/api/accounting'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                    orgs: {
                        endpoint: '/api/account/orgs'
                    }
                }
            },
            kinesis: {
                producer: {
                    stream: 'devWatchmanStream',
                    region: 'narnia'
                }
            }
        };
        mockObjectStore = new MockObjectStore();
        mockStreams = {
            orgs: new MockObjectStream(),
            campaigns: {}
        };
        CwrxEntities = jasmine.createSpy('CwrxEntities()').and.callFake(function(url, appCreds, qs) {
            if (/orgs/.test(url)) {
                return mockStreams.orgs;
            } else {
                return mockStreams.campaigns[qs.org];
            }
        });
        balanceResp = {};
        CwrxRequest = jasmine.createSpy('CwrxRequest()');
        CwrxRequest['@noCallThru'] = true;
        CwrxRequest.prototype = {
            get: jasmine.createSpy('get()').and.callFake(function() { return Q.resolve([balanceResp, {}]); })
        };
        JsonProducer = jasmine.createSpy('JsonProducer()');
        JsonProducer.prototype = {
            produce: jasmine.createSpy('produce()'),
            createWriteStream: jasmine.createSpy('createWriteStream()').and.returnValue(mockObjectStore)
        };
        spyOn(url, 'resolve').and.callThrough();
        factory = proxyquire('../../src/actions/check_available_funds.js', {
            '../../lib/CwrxEntities.js': CwrxEntities,
            '../../lib/CwrxRequest.js': CwrxRequest,
            'rc-kinesis': {
                JsonProducer: JsonProducer,
                '@noCallThru': true
            },
            'url': url
        });
        action = factory(mockConfig);
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
        expect(factory.name).toBe('checkAvailableFundsFactory');
        expect(action).toEqual(jasmine.any(Function));
        expect(action.name).toBe('checkAvailableFunds');
    });

    it('should create the json producer and CwrxRequest', function() {
        expect(JsonProducer).toHaveBeenCalledWith('devWatchmanStream', jasmine.objectContaining({
            region: 'narnia'
        }));
        expect(CwrxRequest).toHaveBeenCalledWith('appCreds');
    });

    describe('creates an action that', function() {
        beforeEach(function() {
            mockStreams.orgs.source.add([
                { id: 'o-1', status: 'active', name: 'org 1' }
            ], true);
            mockStreams.campaigns['o-1'] = new MockObjectStream();
            mockStreams.campaigns['o-1'].source.add([
                { id: 'cam-1', status: 'active', org: 'o-1', pricing: { budget: 100 } },
                { id: 'cam-2', status: 'active', org: 'o-1', pricing: { budget: 200 } }
            ], true);
            balanceResp = {
                'o-1': {
                    balance: -300.12,
                    outstandingBudget: 500.45,
                    totalSpend: 13.3
                }
            };
        });

        it('should produce campaignOutOfFunds for all active campaigns from an org without funds', function(done) {
            action({}).then(function() {
                expect(CwrxEntities.calls.count()).toBe(2);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-1', statuses: 'active' });
                expect(CwrxRequest.prototype.get.calls.count()).toBe(1);
                expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({ url: 'https://apiroot.com/api/accounting/balances', qs: { orgs: 'o-1' } });
                expect(mockObjectStore.items.length).toBe(2);
                expect(mockObjectStore.items[0]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-1', status: 'active', org: 'o-1', pricing: { budget: 100 } } }
                });
                expect(mockObjectStore.items[1]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-2', status: 'active', org: 'o-1', pricing: { budget: 200 } } }
                });
            }).then(done, done.fail);
        });

        it('should ignore campaigns without a budget', function(done) {
            mockStreams.campaigns['o-1'].source.add([
                { id: 'cam-13', status: 'active', org: 'o-1', pricing: { dailyLimit: 10 } },
                { id: 'cam-14', status: 'active', org: 'o-1' },
                { id: 'cam-15', status: 'active', org: 'o-1', pricing: { budget: 0 } },
                { id: 'cam-16', status: 'active', org: 'o-1', pricing: { budget: 666 } }
            ], true);

            action({}).then(function() {
                expect(mockObjectStore.items.length).toBe(3);
                expect(mockObjectStore.items[0]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-1', status: 'active', org: 'o-1', pricing: { budget: 100 } } }
                });
                expect(mockObjectStore.items[1]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-2', status: 'active', org: 'o-1', pricing: { budget: 200 } } }
                });
                expect(mockObjectStore.items[2]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-16', status: 'active', org: 'o-1', pricing: { budget: 666 } } }
                });
            }).then(done, done.fail);
        });

        it('should handle multiple orgs', function(done) {
            mockStreams.orgs.source.add([
                { id: 'o-2', status: 'active', name: 'org 2' },
                { id: 'o-no-stats', status: 'active', name: 'no stats' },
                { id: 'o-enough-balance', status: 'active', name: 'enough balance' },
                { id: 'o-no-outstanding-budget', status: 'active', name: 'no stats' },
                { id: 'o-no-campaigns', status: 'active', name: 'no campaigns' }
            ]);
            balanceResp['o-2'] = { balance: -200.1, outstandingBudget: 100.1, totalSpend: 1 };
            balanceResp['o-no-stats'] = null;
            balanceResp['o-enough-balance'] = { balance: 5000.1, outstandingBudget: 100.1, totalSpend: 1 };
            balanceResp['o-no-outstanding-budget'] = { balance: -200.1, outstandingBudget: 0, totalSpend: 1 };
            balanceResp['o-no-campaigns'] = { balance: -200.1, outstandingBudget: 100.1, totalSpend: 1 };

            mockStreams.campaigns['o-2'] = new MockObjectStream();
            mockStreams.campaigns['o-2'].source.add([
                { id: 'cam-o2-1', status: 'active', org: 'o-2', pricing: { budget: 100 } },
                { id: 'cam-o2-2', status: 'active', org: 'o-2', pricing: { budget: 200 } }
            ], true);
            mockStreams.campaigns['o-no-campaigns'] = new MockObjectStream();
            mockStreams.campaigns['o-no-campaigns'].source.add([], true);

            action({}).then(function() {
                expect(CwrxEntities.calls.count()).toBe(4);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-1', statuses: 'active' });
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-2', statuses: 'active' });
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-no-campaigns', statuses: 'active' });
                expect(CwrxRequest.prototype.get.calls.count()).toBe(1);
                expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                    url: 'https://apiroot.com/api/accounting/balances',
                    qs: { orgs: 'o-1,o-2,o-no-stats,o-enough-balance,o-no-outstanding-budget,o-no-campaigns' }
                });
                expect(mockObjectStore.items.length).toBe(4);
                expect(mockObjectStore.items[0]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-1', status: 'active', org: 'o-1', pricing: { budget: 100 } } }
                });
                expect(mockObjectStore.items[1]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-2', status: 'active', org: 'o-1', pricing: { budget: 200 } } }
                });
                expect(mockObjectStore.items[2]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-o2-1', status: 'active', org: 'o-2', pricing: { budget: 100 } } }
                });
                expect(mockObjectStore.items[3]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-o2-2', status: 'active', org: 'o-2', pricing: { budget: 200 } } }
                });
            }).then(done, done.fail);
        });

        it('should handle the case where no orgs are fetched', function(done) {
            mockStreams.orgs.source.items = [];
            action({}).then(function() {
                expect(CwrxEntities.calls.count()).toBe(1);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxRequest.prototype.get).not.toHaveBeenCalled();
                expect(mockObjectStore.items).toEqual([]);
            }).then(done, done.fail);
        });

        it('should handle batches of 50 orgs at a time', function(done) {
            for (var i = 2; i <= 200; i++) {
                var id = 'o-' + i;
                mockStreams.orgs.source.add([{ id: id, status: 'active' }]);
                balanceResp[id] = null;
            }

            action({}).then(function() {
                expect(CwrxEntities.calls.count()).toBe(2);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-1', statuses: 'active' });

                expect(CwrxRequest.prototype.get.calls.count()).toBe(4);
                CwrxRequest.prototype.get.calls.allArgs().forEach(function(argArr, idx) {
                    expect(argArr[0].url).toBe('https://apiroot.com/api/accounting/balances');
                    var orgIds = argArr[0].qs.orgs.split(',');
                    expect(orgIds.length).toBe(50);
                    expect(orgIds[0]).toBe('o-' + String((idx * 50) + 1));
                    expect(orgIds[49]).toBe('o-' + String(((idx + 1) * 50)));
                });

                expect(mockObjectStore.items.length).toBe(2);
                expect(mockObjectStore.items[0]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-1', status: 'active', org: 'o-1', pricing: { budget: 100 } } }
                });
                expect(mockObjectStore.items[1]).toEqual({
                    type: 'campaignOutOfFunds',
                    data: { campaign: { id: 'cam-2', status: 'active', org: 'o-1', pricing: { budget: 200 } } }
                });
            }).then(done, done.fail);
        });

        it('should reject if fetching orgs fails', function(done) {
            mockStreams.orgs.source.fail(new Error('Orgs got a problem'));
            action({}).then(done.fail)
            .catch(function(error) {
                expect(error).toEqual(new Error('Orgs got a problem'));
                expect(CwrxEntities.calls.count()).toBe(1);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxRequest.prototype.get).not.toHaveBeenCalled();
                expect(mockObjectStore.items).toEqual([]);
            }).then(done, done.fail);
        });

        it('should reject if fetching balances fails', function(done) {
            balanceResp = Q.reject(new Error('Accountant got a problem'));
            action({}).then(done.fail)
            .catch(function(error) {
                expect(error).toEqual(new Error('Accountant got a problem'));
                expect(CwrxEntities.calls.count()).toBe(1);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxRequest.prototype.get).toHaveBeenCalled();
                expect(mockObjectStore.items).toEqual([]);
            }).then(done, done.fail);
        });

        it('should reject if fetching campaigns fails', function(done) {
            mockStreams.campaigns['o-1'].source.fail(new Error('Campaigns got a problem'));
            action({}).then(done.fail)
            .catch(function(error) {
                expect(error).toEqual(new Error('Campaigns got a problem'));
                expect(CwrxEntities.calls.count()).toBe(2);
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/account/orgs', 'appCreds');
                expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-1', statuses: 'active' });
                expect(CwrxRequest.prototype.get).toHaveBeenCalled();
                expect(mockObjectStore.items).toEqual([]);
            }).then(done, done.fail);
        });
    });
});
