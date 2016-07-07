'use strict';

const createUuid = require('rc-uuid').createUuid;
const proxyquire = require('proxyquire');
const assign = require('lodash').assign;
const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;

function defer() {
    const deferred = {};
    const promise = new Promise((resolve, reject) => {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });

    deferred.promise = promise;

    return deferred;
}

describe('cleanUpCampaignFactory', function() {
    let BeeswaxClient, queries, edits, showcaseLib;
    let factory;

    beforeEach(function() {
        queries = {
            lineItems: []
        };
        edits = {
            lineItems: [],
            campaigns: []
        };

        BeeswaxClient = jasmine.createSpy('BeeswaxClient()').and.callFake(config => {
            const client = new (require('beeswax-client'))(config);

            spyOn(client.lineItems, 'queryAll').and.callFake(() => {
                const deferred = defer();

                queries.lineItems.push(deferred);

                return deferred.promise;
            });
            spyOn(client.lineItems, 'edit').and.callFake(() => {
                const deferred = defer();

                edits.lineItems.push(deferred);

                return deferred.promise;
            });

            spyOn(client.campaigns, 'edit').and.callFake(() => {
                const deferred = defer();

                edits.campaigns.push(deferred);

                return deferred.promise;
            });

            return client;
        });

        showcaseLib = (showcaseLib => jasmine.createSpy('showcase()').and.callFake(showcaseLib))(require('../../lib/showcase'));

        factory = proxyquire('../../src/actions/showcase/apps/clean_up_campaign', {
            'beeswax-client': BeeswaxClient,
            '../../../../lib/showcase': showcaseLib,
            'cwrx/lib/logger': logger
        });
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', function() {
        let config;
        let action;
        let beeswax, showcase, log;

        beforeEach(function() {
            config = {
                state: {
                    secrets: {
                        beeswax: {
                            email: 'ops@reelcontent.com',
                            password: 'wueyrfhu83rgf4u3gr'
                        }
                    }
                },
                beeswax: {
                    apiRoot: 'https://stingersbx.api.beeswax.com'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        payments: {
                            endpoint: '/api/payments/'
                        },
                        campaigns: {
                            endpoint: '/api/campaigns'
                        },
                        transactions: {
                            endpoint: '/api/transactions'
                        },
                        analytics: {
                            endpoint: '/api/analytics'
                        }
                    }
                }
            };

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'trace',
                'info',
                'warn',
                'error'
            ]));

            action = factory(config);
            beeswax = BeeswaxClient.calls.mostRecent().returnValue;
            showcase = showcaseLib.calls.mostRecent().returnValue;
        });

        it('should return an action', function() {
            expect(action).toEqual(jasmine.any(Function));
        });

        it('should create a BeeswaxClient', function() {
            expect(BeeswaxClient).toHaveBeenCalledWith({
                apiRoot: config.beeswax.apiRoot,
                creds: config.state.secrets.beeswax
            });
        });

        it('should create a showcase lib', function() {
            expect(showcaseLib).toHaveBeenCalledWith(config);
        });

        describe('(the action)', function() {
            let campaign;
            let event;
            let success, failure;

            beforeEach(function(done) {
                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                campaign = {
                    id: `cam-${createUuid()}`,
                    org: `o-${createUuid()}`,
                    externalCampaigns: {
                        beeswax: {
                            externalId: 48354
                        }
                    }
                };

                event = {
                    data: {
                        campaign,
                        previousState: 'active',
                        currentState: 'cancelled',
                        date: new Date().toISOString()
                    },
                    options: {}
                };

                action(event).then(success, failure);
                setTimeout(done);
            });

            it('should get all of the beeswax campaign\'s line items', function() {
                expect(beeswax.lineItems.queryAll).toHaveBeenCalledWith({ campaign_id: campaign.externalCampaigns.beeswax.externalId, active: true });
            });

            describe('if the campaign has no externalCampaigns', function() {
                beforeEach(function(done) {
                    delete campaign.externalCampaigns;

                    success.calls.reset();
                    failure.calls.reset();
                    beeswax.lineItems.queryAll.calls.reset();

                    action(event).then(success, failure);
                    setTimeout(done);
                });

                it('should log a warning', function() {
                    expect(log.warn).toHaveBeenCalledWith(jasmine.any(String));
                });

                it('should not perform any queries', function() {
                    expect(beeswax.lineItems.queryAll).not.toHaveBeenCalled();
                });

                it('should fulfill the promise', function() {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if there is a problem', function() {
                let reason;

                beforeEach(function(done) {
                    reason = new Error('Something bad happened in Beeswax!');

                    queries.lineItems[0].reject(reason);
                    setTimeout(done);
                });

                it('should reject the promise', function() {
                    expect(failure).toHaveBeenCalledWith(new Error(`Couldn't clean up beeswax entities for campaign(${campaign.id}): ${inspect(reason)}`));
                });
            });

            describe('when the line items are fetched', function() {
                let lineItems;

                beforeEach(function(done) {
                    lineItems = [
                        {
                            line_item_id: 84649,
                            campaign_id: 48354,
                            advertiser_id: 53987,
                            line_item_type_id: 0,
                            targeting_template_id: 10331,
                            line_item_version: 1,
                            line_item_name: 'Some Ad Thing',
                            line_item_budget: 1125,
                            daily_budget: null,
                            budget_type: 1,
                            line_item_spend: 0,
                            frequency_cap: [],
                            bidding: [Object],
                            pacing: 1,
                            revenue_type: null,
                            revenue_amount: null,
                            start_date: '2016-06-28 00:00:00',
                            end_date: '2016-07-09 23:59:59',
                            push_status: 0,
                            push_update: true,
                            account_id: 83,
                            create_date: '2016-06-28 14:42:09',
                            update_date: '2016-06-28 14:42:09',
                            alternative_id: null,
                            notes: null,
                            active: true,
                            buzz_key: 'stingersbx'
                        },
                        {
                            line_item_id: 97639,
                            campaign_id: 48354,
                            advertiser_id: 53987,
                            line_item_type_id: 0,
                            targeting_template_id: 10331,
                            line_item_version: 1,
                            line_item_name: 'Some Ad Thing',
                            line_item_budget: 1125,
                            daily_budget: null,
                            budget_type: 1,
                            line_item_spend: 0,
                            frequency_cap: [],
                            bidding: [Object],
                            pacing: 1,
                            revenue_type: null,
                            revenue_amount: null,
                            start_date: '2016-06-28 00:00:00',
                            end_date: '2016-07-09 23:59:59',
                            push_status: 0,
                            push_update: true,
                            account_id: 83,
                            create_date: '2016-06-28 14:42:09',
                            update_date: '2016-06-28 14:42:09',
                            alternative_id: null,
                            notes: null,
                            active: true,
                            buzz_key: 'stingersbx'
                        }
                    ];

                    queries.lineItems[0].resolve({
                        success: true,
                        payload: lineItems
                    });
                    setTimeout(done);
                });

                it('should set all the line items to inactive', function() {
                    lineItems.forEach(lineItem => expect(beeswax.lineItems.edit).toHaveBeenCalledWith(lineItem.line_item_id, { active: false }));
                });

                describe('if there is a problem', function() {
                    let reason;

                    beforeEach(function(done) {
                        reason = new Error('Something bad happened in Beeswax!');

                        edits.lineItems[0].reject(reason);
                        setTimeout(done);
                    });

                    it('should reject the promise', function() {
                        expect(failure).toHaveBeenCalledWith(new Error(`Couldn't clean up beeswax entities for campaign(${campaign.id}): ${inspect(reason)}`));
                    });
                });

                describe('when all the line items have been deactivated', function() {
                    beforeEach(function(done) {
                        edits.lineItems.forEach((deferred, index) => {
                            const lineItem = lineItems[index];

                            deferred.resolve({
                                success: true,
                                payload: assign({}, lineItem, { active: false })
                            });
                        });
                        setTimeout(done);
                    });

                    it('should deactivate the campaign', function() {
                        expect(beeswax.campaigns.edit).toHaveBeenCalledWith(campaign.externalCampaigns.beeswax.externalId, { active: false });
                    });

                    describe('if there is a problem', function() {
                        let reason;

                        beforeEach(function(done) {
                            reason = new Error('Something bad happened in Beeswax!');

                            edits.campaigns[0].reject(reason);
                            setTimeout(done);
                        });

                        it('should reject the promise', function() {
                            expect(failure).toHaveBeenCalledWith(new Error(`Couldn't clean up beeswax entities for campaign(${campaign.id}): ${inspect(reason)}`));
                        });
                    });

                    describe('when the campaign has been deactivated', function() {
                        let rebalanceDeferred;

                        beforeEach(function(done) {
                            spyOn(showcase, 'rebalance').and.returnValue((rebalanceDeferred = defer()).promise);

                            edits.campaigns[0].resolve({
                                success: true,
                                payload: {
                                    campaign_id: campaign.externalCampaigns.beeswax.externalId,
                                    active: false
                                }
                            });
                            setTimeout(done);
                        });

                        it('should perform a rebalance', function() {
                            expect(showcase.rebalance).toHaveBeenCalledWith(campaign.org);
                        });

                        describe('if the rebalance succeeds', function() {
                            beforeEach(function(done) {
                                rebalanceDeferred.resolve([]);
                                setTimeout(done);
                            });

                            it('should fulfill the promise', function() {
                                expect(success).toHaveBeenCalledWith(undefined);
                            });
                        });

                        describe('if the rebalance fails', function() {
                            let reason;

                            beforeEach(function(done) {
                                reason = new Error('Some terrible reason.');
                                rebalanceDeferred.reject(reason);

                                setTimeout(done);
                            });

                            it('should log an error', function() {
                                expect(log.error).toHaveBeenCalledWith(jasmine.any(String));
                            });

                            it('should fulfill the promise', function() {
                                expect(success).toHaveBeenCalledWith(undefined);
                            });
                        });
                    });
                });
            });
        });
    });
});
