'use strict';

const actionFactory = require('../../src/actions/transition_payment_plans');
const CwrxRequest = require('../../lib/CwrxRequest');
const logger = require('cwrx/lib/logger');
const moment = require('moment');

describe('the transition payment plans action', function () {
    beforeEach(function () {
        const config = {
            appCreds: { },
            cwrx: {
                api: {
                    root: 'https://root.com',
                    orgs: {
                        endpoint: 'api/account/orgs'
                    }
                }
            }
        };
        this.event = {
            data: { },
            options: { }
        };
        this.mockLog = {
            trace: jasmine.createSpy('trace'),
            info: jasmine.createSpy('info'),
            warn: jasmine.createSpy('warn'),
            error: jasmine.createSpy('error')
        };
        spyOn(logger, 'getLog').and.returnValue(this.mockLog);
        spyOn(CwrxRequest.prototype, 'get');
        spyOn(CwrxRequest.prototype, 'put');
        this.action = actionFactory(config);
    });

    it('should export an action factory', function () {
        expect(actionFactory).toEqual(jasmine.any(Function));
        expect(actionFactory.name).toBe('factory');
    });

    it('should be able to create an action', function () {
        expect(this.action).toEqual(jasmine.any(Function));
    });

    it('should reject if there is no org in data', function (done) {
        this.action(this.event).then(done.fail, error => {
            expect(error).toEqual(jasmine.any(Error));
            expect(error.message).toBe('data must contain an org');
        }).then(done, done.fail);
    });

    it('should make a request for the payment plan information of an org', function (done) {
        this.event.data.org = {
            id: 'o-123'
        };
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
            nextPaymentPlanId: null
        }]));
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.get).toHaveBeenCalledWith({
                url: 'https://root.com/api/account/orgs/o-123/payment-plan'
            });
        }).then(done, done.fail);
    });

    it('should not edit the org if there is not a next payment plan', function (done) {
        this.event.data.org = {
            id: 'o-123'
        };
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
            nextPaymentPlanId: null
        }]));
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.put).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should handle if there if a next payment plan but no effective date', function (done) {
        this.event.data.org = {
            id: 'o-123'
        };
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
            nextPaymentPlanId: 'pp-123',
            effectiveDate: null
        }]));
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.put).not.toHaveBeenCalled();
            expect(this.mockLog.error).toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should not edit the org if the effective date is in the future', function (done) {
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.data.date = moment().toISOString();
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
            nextPaymentPlanId: 'pp-123',
            effectiveDate: moment().add(1, 'day').toISOString()
        }]));
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.put).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should edit the org with the updated payment plan if the effective date is in the past', function (done) {
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.data.date = moment().toISOString();
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
            nextPaymentPlanId: 'pp-123',
            effectiveDate: moment().subtract(1, 'day').toISOString()
        }]));
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.put).toHaveBeenCalledWith({
                url: 'https://root.com/api/account/orgs/o-123',
                json: {
                    paymentPlanId: 'pp-123',
                    nextPaymentPlanId: null
                }
            });
        }).then(done, done.fail);
    });

    it('should edit the org with the updated payment plan if the effective date is now', function (done) {
        const now = moment().toISOString();
        this.event.data.org = {
            id: 'o-123'
        };
        this.event.data.date = now;
        CwrxRequest.prototype.get.and.returnValue(Promise.resolve([{
            nextPaymentPlanId: 'pp-123',
            effectiveDate: now
        }]));
        this.action(this.event).then(() => {
            expect(CwrxRequest.prototype.put).toHaveBeenCalledWith({
                url: 'https://root.com/api/account/orgs/o-123',
                json: {
                    paymentPlanId: 'pp-123',
                    nextPaymentPlanId: null
                }
            });
        }).then(done, done.fail);
    });
});
