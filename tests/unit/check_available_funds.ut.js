'use strict';

var CwrxEntities;
var CwrxRequest;
var JsonProducer;
var MockObjectStore = require('../helpers/MockObjectStore.js');
var MockObjectStream = require('../helpers/MockObjectStream.js');
var Q = require('q');
var factory;
var proxyquire = require('proxyquire');
var url = require('url');
var ld = require('lodash');

describe('check_available_funds', function() {
    var mockConfig, action, mockObjectStream, mockObjectStore;

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
        mockObjectStream = new MockObjectStream();
        mockObjectStore = new MockObjectStore();
        CwrxEntities = jasmine.createSpy('CwrxEntities()').and.returnValue(mockObjectStream);
        CwrxRequest = jasmine.createSpy('CwrxRequest()');
        CwrxRequest['@noCallThru'] = true;
        CwrxRequest.prototype = {
            get: jasmine.createSpy('get()')
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

    it('create the json producer', function() {
        expect(JsonProducer).toHaveBeenCalledWith('devWatchmanStream', jasmine.objectContaining({
            region: 'narnia'
        }));
    });

    it('should reject if not passed a valid org through data', function(done) {
        Q.all([{ }, { org: null }, { org: 'o-123' }].map(function(data) {
            return action({ data: data, options: { } }).catch(function(error) {
                expect(error).toBeDefined();
            });
        })).then(done, done.fail);
    });

    it('should fetch the available funds of the org passed through data', function(done) {
        CwrxRequest.prototype.get.and.returnValue(Q.resolve([{}]));
        action({ data: { org: { id: 'o-123' } }, options: { } }).then(function() {
            expect(url.resolve).toHaveBeenCalledWith('https://apiroot.com', '/api/accounting/balance');
            expect(CwrxRequest).toHaveBeenCalledWith('appCreds');
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                url: 'https://apiroot.com/api/accounting/balance',
                qs: {
                    org: 'o-123'
                }
            });
        }).then(done, done.fail);
    });

    describe('if the available funds are at or below zero', function() {
        [0, -100].forEach(function(balance) {
            describe('if the budget is ' + balance, function() {
                describe('if aggregate campaign budgets are 0', function() {
                    beforeEach(function() {
                        CwrxRequest.prototype.get.and.returnValue(Q.resolve([{
                            balance: balance,
                            outstandingBudget: 0
                        }]));
                    });

                    it('should not fetch campaigns in the org', function(done) {
                        action({ data: { org: { id: 'o-123' } }, options: { } }).then(function() {
                            CwrxRequest.prototype.get.calls.allArgs().forEach(function(arg) {
                                expect(arg.url).not.toContain('campaigns');
                            });
                        }).then(done, done.fail);
                    });
                });

                describe('if aggregate campaign budgets are greater than 0', function() {
                    var campaigns;

                    beforeEach(function() {
                        CwrxRequest.prototype.get.and.returnValue(Q.resolve([{
                            balance: balance,
                            outstandingBudget: 100
                        }]));
                        campaigns = [
                            {
                                id: 'cam-123',
                                pricing: {
                                    budget: 0
                                }
                            },
                            {
                                id: 'cam-456',
                                pricing: {
                                    budget: 100
                                }
                            }
                        ];
                    });

                    it('should fetch the campaigns in the org', function(done) {
                        mockObjectStream.source.add(ld.chunk(campaigns, 1), true);
                        action({ data: { org: { id: 'o-123' } }, options: { } }).then(function() {
                            expect(CwrxEntities).toHaveBeenCalledWith('https://apiroot.com/api/campaigns', 'appCreds', { org: 'o-123', statuses: 'active' });
                        }).then(done, done.fail);
                    });

                    it('should produce campaigns with a budget greater than zero', function(done) {
                        mockObjectStream.source.add(ld.chunk(campaigns, 1), true);
                        action({ data: { org: { id: 'o-123' } }, options: { } }).then(function() {
                            expect(JsonProducer.prototype.createWriteStream).toHaveBeenCalledWith();
                            expect(mockObjectStore.items).toEqual([{
                                type: 'campaignOutOfFunds',
                                data: {
                                    campaign: campaigns[1]
                                }
                            }]);
                        }).then(done, done.fail);
                    });

                    it('should reject if there is a problem fetching the campaigns', function(done) {
                        mockObjectStream.source.fail(new Error('epic fail'));
                        action({ data: { org: { id: 'o-123' } }, options: { } }).then(done.fail).catch(function(error) {
                            expect(error).toBeDefined();
                        }).then(done, done.fail);
                    });

                    it('should reject if there is a problem producing the campaigns', function(done) {
                        mockObjectStream.source.add(ld.chunk(campaigns, 1), true);
                        mockObjectStore.fail(new Error('epic fail'));
                        action({ data: { org: { id: 'o-123' } }, options: { } }).then(done.fail).catch(function(error) {
                            expect(error).toBeDefined();
                        }).then(done, done.fail);
                    });
                });
            });
        });
    });

    describe('if the available funds are greater than zero', function() {
        beforeEach(function() {
            CwrxRequest.prototype.get.and.returnValue(Q.resolve([{
                balance: 100,
                outstandingBudget: 50
            }]));
        });

        it('should not fetch the campaigns in the org', function(done) {
            action({ data: { org: { id: 'o-123' } }, options: { } }).then(function() {
                CwrxRequest.prototype.get.calls.allArgs().forEach(function(arg) {
                    expect(arg.url).not.toContain('campaigns');
                });
            }).then(done, done.fail);
        });
    });
});
