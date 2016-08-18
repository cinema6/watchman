'use strict';

const BeeswaxMiddleware = require('../../lib/BeeswaxMiddleware');
const proxyquire = require('proxyquire');
const logger = require('cwrx/lib/logger');
const rcKinesis = require('rc-kinesis');

describe('the reactivate campaign action', function () {
    beforeEach(function () {
        const showcaseLib = (showcaseLib => jasmine.createSpy('showcase').and.callFake(showcaseLib))(require('../../lib/showcase'));
        const config = {
            cwrx: {
                api: {
                    root: 'https://root.com',
                    advertisers: {
                        endpoint: 'advertisers'
                    },
                    campaigns: {
                        endpoint: 'campaigns'
                    },
                    placements: {
                        endpoint: 'placements'
                    },
                    transactions: {
                        endpoint: 'transactions'
                    },
                    analytics: {
                        endpoint: 'analytics'
                    },
                    orgs: {
                        endpoint: 'orgs'
                    },
                    paymentPlans: {
                        endpoint: 'payment-plans'
                    },
                    tracking: 'tracking'
                }
            },
            beeswax: {
                apiRoot: 'https://bees.com'
            },
            state: {
                secrets: {
                    beeswax: {
                        email: 'foo@bar.com',
                        password: 'password'
                    }
                }
            },
            appCreds: { },
            kinesis: {
                producer: {
                    stream: 'stream'
                }
            }
        };
        this.event = {
            data: { },
            options: { }
        };
        this.campaign = {
            id: 'cam-123',
            org: 'o-123'
        };
        this.mockLog = {
            trace: jasmine.createSpy('trace'),
            info: jasmine.createSpy('info'),
            warn: jasmine.createSpy('warn'),
            error: jasmine.createSpy('error')
        };
        spyOn(logger, 'getLog').and.returnValue(this.mockLog);
        spyOn(BeeswaxMiddleware.prototype, 'reactivateCampaign');
        spyOn(rcKinesis.JsonProducer.prototype, 'produce');
        this.factory = proxyquire('../../src/actions/showcase/apps/reactivate_campaign', {
            'beeswax-client': BeeswaxMiddleware,
            '../../../../lib/showcase': showcaseLib
        });
        this.action = this.factory(config);
        this.showcase = showcaseLib.calls.mostRecent().returnValue;
        this.beeswax = showcaseLib.calls.mostRecent().returnValue;
        spyOn(this.showcase, 'rebalance');
        spyOn(this.showcase, 'checkWithinCampaignLimit');
    });

    it('should export an action factory', function () {
        expect(this.factory).toEqual(jasmine.any(Function));
        expect(this.factory.name).toBe('factory');
    });

    it('should be able to create an action', function () {
        expect(this.action).toEqual(jasmine.any(Function));
    });

    it('should check to see if the org is within their campaigns limit', function (done) {
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.resolve());
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.resolve());
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.resolve());
        this.action(this.event).then(() => {
            expect(this.showcase.checkWithinCampaignLimit).toHaveBeenCalledWith(this.campaign.org);
        }).then(done, done.fail);
    });

    it('should update the campaign status in beeswax', function (done) {
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.resolve());
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.resolve());
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.resolve());
        this.action(this.event).then(() => {
            expect(BeeswaxMiddleware.prototype.reactivateCampaign).toHaveBeenCalledWith(this.campaign);
        }).then(done, done.fail);
    });

    it('should perform a rebalance of the campaign in beeswax', function (done) {
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.resolve());
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.resolve());
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.resolve());
        this.action(this.event).then(() => {
            expect(this.showcase.rebalance).toHaveBeenCalledWith('o-123');
        }).then(done, done.fail);
    });

    it('should produce when campaign reactivation succeeds', function (done) {
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.resolve());
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.resolve());
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.resolve());
        this.action(this.event).then(() => {
            expect(rcKinesis.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                type: 'reactivateCampaignSuccess',
                data: {
                    campaign: this.campaign
                }
            });
        }).then(done, done.fail);
    });

    it('should handle if the org has breached their campaigns limit', function (done) {
        const error = new Error('epic fail');
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.reject(error));
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.resolve());
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.resolve());
        this.action(this.event).then(() => {
            expect(BeeswaxMiddleware.prototype.reactivateCampaign).not.toHaveBeenCalled();
            expect(this.showcase.rebalance).not.toHaveBeenCalled();
            expect(this.mockLog.error).toHaveBeenCalled();
            expect(rcKinesis.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                type: 'reactivateCampaignFailure',
                data: {
                    campaign: this.campaign,
                    error: error.message
                }
            });
        }).then(done, done.fail);
    });

    it('should handle if there is a problem updating the campaign status in beeswax', function (done) {
        const error = new Error('epic fail');
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.resolve());
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.reject(error));
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.resolve());
        this.action(this.event).then(() => {
            expect(this.showcase.rebalance).not.toHaveBeenCalled();
            expect(this.mockLog.error).toHaveBeenCalled();
            expect(rcKinesis.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                type: 'reactivateCampaignFailure',
                data: {
                    campaign: this.campaign,
                    error: error.message
                }
            });
        }).then(done, done.fail);
    });

    it('should handle if there is a problem performing the rebalance', function (done) {
        const error = new Error('epic fail');
        this.event.data.campaign = this.campaign;
        this.showcase.checkWithinCampaignLimit.and.returnValue(Promise.resolve());
        BeeswaxMiddleware.prototype.reactivateCampaign.and.returnValue(Promise.resolve());
        rcKinesis.JsonProducer.prototype.produce.and.returnValue(Promise.resolve());
        this.showcase.rebalance.and.returnValue(Promise.reject(error));
        this.action(this.event).then(() => {
            expect(this.mockLog.error).toHaveBeenCalled();
            expect(rcKinesis.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                type: 'reactivateCampaignFailure',
                data: {
                    campaign: this.campaign,
                    error: error.message
                }
            });
        }).then(done, done.fail);
    });
});
