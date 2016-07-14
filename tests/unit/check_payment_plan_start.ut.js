var Q = require('q');
var checkPaymentPlanStart = require('../../src/actions/check_payment_plan_start.js');
var moment = require('moment');
var rcKinesis = require('rc-kinesis');

describe('check_payment_plan_start', function() {
    'use strict';

    beforeEach(function() {
        this.JsonProducer = rcKinesis.JsonProducer;
        spyOn(this.JsonProducer.prototype, 'produce');
        this.config = {
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
        this.action = checkPaymentPlanStart(this.config);
    });

    it('should export an action factory', function() {
        expect(checkPaymentPlanStart).toEqual(jasmine.any(Function));
        expect(checkPaymentPlanStart.name).toBe('factory');
    });

    it('should be able to create an action', function() {
        expect(this.action).toEqual(jasmine.any(Function));
        expect(this.action.name).toBe('action');
    });

    it('should produce an event if the payment plan starts on the given day', function(done) {
        var self = this;
        var org = {
            paymentPlanStart: moment().toISOString()
        };
        self.event.data.org = org;
        self.event.data.date = moment().startOf('day').toISOString();
        self.JsonProducer.prototype.produce.and.returnValue(Q.resolve());
        self.action(this.event).then(function() {
            expect(self.JsonProducer.prototype.produce).toHaveBeenCalledWith({
                type: 'paymentPlanWillStart',
                data: {
                    org: org
                }
            });
        }).then(done, done.fail);
    });

    it('should not produce an event if the payment plan does not start on the given day', function(done) {
        var self = this;
        var org = {
            paymentPlanStart: moment().add(1, 'day').toISOString()
        };
        self.event.data.org = org;
        self.event.data.date = moment().toISOString();
        self.JsonProducer.prototype.produce.and.returnValue(Q.resolve());
        self.action(this.event).then(function() {
            expect(self.JsonProducer.prototype.produce).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should not produce if the org does not have a payment plan start date', function(done) {
        var self = this;
        var org = { };
        self.event.data.org = org;
        self.event.data.date = moment().toISOString();
        self.JsonProducer.prototype.produce.and.returnValue(Q.resolve());
        self.action(this.event).then(function() {
            expect(self.JsonProducer.prototype.produce).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should reject if producing an event fails', function(done) {
        var failure = 'epic fail';
        var date = moment();
        var org = {
            paymentPlanStart: date.toISOString()
        };
        this.event.data.org = org;
        this.event.data.date = date.startOf('day').toISOString();
        this.JsonProducer.prototype.produce.and.returnValue(Q.reject(failure));
        this.action(this.event).then(done.fail).catch(function(error) {
            expect(error).toBe(failure);
        }).then(done, done.fail);
    });
});
