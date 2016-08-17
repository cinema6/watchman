'use strict';

const proxyquire = require('proxyquire');

describe('(action factory) check_plan_upgrade', () => {
    let q, createUuid, resolveURL, moment, logger, _, Status;
    let JsonProducer, CwrxRequest;
    let factory;

    beforeAll(() => {
        q = require('q');
        createUuid = require('rc-uuid').createUuid;
        resolveURL = require('url').resolve;
        moment = require('moment');
        logger = require('cwrx/lib/logger');
        _ = require('lodash');
        Status = require('cwrx/lib/enums').Status;
    });

    beforeEach(() => {
        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                let producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));

        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                let request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));

        factory = proxyquire('../../src/actions/showcase/apps/auto_archive_campaigns', {
            'rc-kinesis': {
                JsonProducer
            },
            '../../../../lib/CwrxRequest': CwrxRequest
        });
    });

    it('should exist', () => {
        expect(factory).toEqual(jasmine.any(Function));
    });

    describe('when called', () => {
        let config;
        let paymentPlansEndpoint;
        let campaignsEndpoint;
        let action;
        let request, watchmanStream, log;

        beforeEach(() => {
            config = {
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        paymentPlans: {
                            endpoint: '/api/payment-plans'
                        },
                        transactions: {
                            endpoint: '/api/transactions'
                        },
                        orgs: {
                            endpoint: '/api/account/orgs'
                        },
                        payments: {
                            endpoint: '/api/payments/'
                        },
                        campaigns: {
                            endpoint: '/api/campaigns'
                        }
                    }
                },
                kinesis: {
                    producer: {
                        region: 'us-east-1',
                        stream: 'devWatchmanStream'
                    }
                }
            };

            paymentPlansEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.paymentPlans.endpoint);
            campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'info',
                'trace',
                'warn',
                'error'
            ]));

            action = factory(config);

            request = CwrxRequest.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
        });

        it('should return the action Function', () => {
            expect(action).toEqual(jasmine.any(Function));
        });

        it('should create a JsonProducer for watchman', () => {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        it('should create a CwrxRequest', () => {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        describe('the action', () => {
            let data, options, event;
            let previousPlanDeferred;
            let currentPlanDeferred;
            let campaignsDeferred;
            let success, failure;

            beforeEach(done => {
                data = {
                    org: {
                        id: `o-${createUuid()}`
                    },
                    previousPaymentPlanId: `pp-${createUuid()}`,
                    currentPaymentPlanId: `pp-${createUuid()}`,
                    date: moment('2016-08-12T10:22:11Z').utcOffset(0).format()
                };
                options = {};
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                previousPlanDeferred = q.defer();
                currentPlanDeferred = q.defer();
                campaignsDeferred = q.defer();

                spyOn(request, 'get').and.callFake(config => {
                    switch (config.url) {
                    case `${paymentPlansEndpoint}/${data.previousPaymentPlanId}`:
                        return previousPlanDeferred.promise;
                    case `${paymentPlansEndpoint}/${data.currentPaymentPlanId}`:
                        return currentPlanDeferred.promise;
                    case campaignsEndpoint:
                        return campaignsDeferred.promise;
                    default:
                        return q.reject(new Error(`Unknown URL: ${config.url}`));
                    }
                });

                action(event).then(success, failure);
                setTimeout(done);
            });

            it('should fetch the current and previous payment plans', () => {
                expect(request.get.calls.count()).toBe(2);
                expect(request.get).toHaveBeenCalledWith({
                    url: `${paymentPlansEndpoint}/${data.previousPaymentPlanId}`
                });
                expect(request.get).toHaveBeenCalledWith({
                    url: `${paymentPlansEndpoint}/${data.currentPaymentPlanId}`
                });
            });

            describe('if a plan cannot be fetched', () => {
                let reason;

                beforeEach(done => {
                    reason = new Error('Something bad happened!');
                    currentPlanDeferred.reject(reason);
                    setTimeout(done);
                });

                it('should log.error()', () => {
                    expect(log.error).toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the user is downgrading', () => {
                let currentPlan;
                let previousPlan;

                beforeEach(done => {
                    currentPlan = {
                        id: data.currentPaymentPlanId,
                        price: 49.99,
                        maxCampaigns: 3
                    };
                    previousPlan = {
                        id: data.previousPaymentPlanId,
                        price: 149.99,
                        maxCampaigns: 10
                    };

                    currentPlanDeferred.resolve([currentPlan, { statusCode: 200 }]);
                    previousPlanDeferred.resolve([previousPlan, { statusCode: 200 }]);
                    setTimeout(done);
                    request.get.calls.reset();
                });

                it('should get the user\'s non-canceled campaigns', () => {
                    expect(request.get).toHaveBeenCalledWith({
                        url: campaignsEndpoint,
                        qs: {
                            org: data.org.id,
                            statuses: _(Status).values().without(Status.Canceled, Status.Deleted).join(','),
                            sort: 'created,1',
                            application: 'showcase'
                        }
                    });
                });

                describe('if the campaigns can\'t be fetched', () => {
                    let reason;

                    beforeEach(done => {
                        reason = new Error('Something bad happened!');
                        campaignsDeferred.reject(reason);
                        setTimeout(done);
                    });

                    it('should log.error()', () => {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', () => {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                describe('if the user has too many campaigns', () => {
                    let campaigns;
                    let putCampaignDeferreds;

                    beforeEach(done => {
                        campaigns = Array.apply([], new Array(8)).map((na, index) => ({
                            id: `cam-${createUuid()}`,
                            status: _(Status).values().without(Status.Canceled, Status.Deleted).sample(),
                            created: moment().add(index, 'days').format(),
                            product: {
                                foo: 'bar'
                            }
                        }));

                        putCampaignDeferreds = campaigns.reduce((deferreds, campaign) => _.assign(deferreds, {
                            [campaign.id]: q.defer()
                        }), {});
                        spyOn(request, 'put').and.callFake(options => (
                            putCampaignDeferreds[
                                _.find(campaigns, campaign => (
                                    options.url === `${campaignsEndpoint}/${campaign.id}`
                                )).id
                            ].promise
                        ));

                        campaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                        setTimeout(done);
                    });

                    it('should cancel the user\'s oldest campaigns', () => {
                        expect(request.put.calls.count()).toBe(5);
                        campaigns.slice(0, 5).forEach(campaign => expect(request.put).toHaveBeenCalledWith({
                            url: `${campaignsEndpoint}/${campaign.id}`,
                            json: {
                                status: Status.Canceled
                            }
                        }));
                    });

                    describe('if a campaign can\'t be archived', () => {
                        let reason;

                        beforeEach(done => {
                            reason = new Error('Something bad happened!');
                            putCampaignDeferreds[campaigns[1].id].reject(reason);
                            setTimeout(done);
                        });

                        it('should log.error()', () => {
                            expect(log.error).toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', () => {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });

                    describe('when the campaigns are archived', () => {
                        let updatedCampaigns;
                        let produceDeferred;

                        beforeEach(done => {
                            updatedCampaigns = campaigns.slice(0, 5).map((campaign, index) => _.assign({}, campaign, request.put.calls.all()[index].args[0].json));
                            updatedCampaigns.forEach(campaign => putCampaignDeferreds[campaign.id].resolve([campaign, { statusCode: 200 }]));

                            produceDeferred = q.defer();
                            watchmanStream.produce.and.returnValue(produceDeferred.promise);

                            setTimeout(done);
                        });

                        it('should produce a record', () => {
                            expect(watchmanStream.produce).toHaveBeenCalledWith({
                                type: 'archivedShowcaseCampaigns',
                                data: {
                                    org: data.org,
                                    currentPaymentPlan: currentPlan,
                                    previousPaymentPlan: previousPlan,
                                    campaigns: updatedCampaigns,
                                    date: moment(data.date).format()
                                }
                            });
                        });

                        describe('if the record can\'t be produced', () => {
                            let reason;

                            beforeEach(done => {
                                reason = new Error('Something bad happened!');
                                produceDeferred.reject(reason);
                                setTimeout(done);
                            });

                            it('should log.error()', () => {
                                expect(log.error).toHaveBeenCalled();
                            });

                            it('should fulfill with undefined', () => {
                                expect(success).toHaveBeenCalledWith(undefined);
                            });
                        });

                        describe('when the record is produced', () => {
                            beforeEach(done => {
                                produceDeferred.resolve(watchmanStream.produce.calls.mostRecent().args[0]);
                                setTimeout(done);
                            });

                            it('should fulfill with undefined', () => {
                                expect(success).toHaveBeenCalledWith(undefined);
                            });
                        });
                    });
                });

                describe('if the user has the number of campaigns that are permitted', () => {
                    let campaigns;

                    beforeEach(done => {
                        campaigns = Array.apply([], new Array(3)).map((na, index) => ({
                            id: `cam-${createUuid()}`,
                            status: _(Status).values().without(Status.Canceled, Status.Deleted).sample(),
                            created: moment().add(index, 'days').format(),
                            product: {
                                foo: 'bar'
                            }
                        }));

                        spyOn(request, 'put').and.callFake(() => q.defer().promise);

                        campaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                        setTimeout(done);
                    });

                    it('should not cancel anything', () => {
                        expect(request.put).not.toHaveBeenCalled();
                    });

                    it('should not produce anything', () => {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', () => {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                describe('if the user has less than the number of campaigns that are permitted', () => {
                    let campaigns;

                    beforeEach(done => {
                        campaigns = Array.apply([], new Array(2)).map((na, index) => ({
                            id: `cam-${createUuid()}`,
                            status: _(Status).values().without(Status.Canceled, Status.Deleted).sample(),
                            created: moment().add(index, 'days').format(),
                            product: {
                                foo: 'bar'
                            }
                        }));

                        spyOn(request, 'put').and.callFake(() => q.defer().promise);

                        campaignsDeferred.resolve([campaigns, { statusCode: 200 }]);
                        setTimeout(done);
                    });

                    it('should not cancel anything', () => {
                        expect(request.put).not.toHaveBeenCalled();
                    });

                    it('should not produce anything', () => {
                        expect(watchmanStream.produce).not.toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', () => {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });
            });

            describe('if the user is upgrading', () => {
                let currentPlan;
                let previousPlan;

                beforeEach(done => {
                    currentPlan = {
                        id: data.currentPaymentPlanId,
                        price: 149.99,
                        maxCampaigns: 10
                    };
                    previousPlan = {
                        id: data.previousPaymentPlanId,
                        price: 49.99,
                        maxCampaigns: 3
                    };

                    currentPlanDeferred.resolve([currentPlan, { statusCode: 200 }]);
                    previousPlanDeferred.resolve([previousPlan, { statusCode: 200 }]);
                    setTimeout(done);
                    request.get.calls.reset();
                });

                it('should get nothing', () => {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should not produce anything', () => {
                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });

            describe('if the user is initializing a payment plan', () => {
                beforeEach(done => {
                    success.calls.reset();
                    failure.calls.reset();
                    request.get.calls.reset();

                    data.previousPaymentPlanId = null;

                    action(event).then(success, failure);
                    setTimeout(done);
                });

                it('should not GET anything', () => {
                    expect(request.get).not.toHaveBeenCalled();
                });

                it('should not produce anything', () => {
                    expect(watchmanStream.produce).not.toHaveBeenCalled();
                });

                it('should fulfill with undefined', () => {
                    expect(success).toHaveBeenCalledWith(undefined);
                });
            });
        });
    });
});
