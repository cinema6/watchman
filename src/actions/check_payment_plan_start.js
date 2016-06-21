var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var moment = require('moment');
var rcKinesis = require('rc-kinesis');

module.exports = function factory(config) {
    'use strict';

    var log = logger.getLog();
    var producer = new rcKinesis.JsonProducer(config.kinesis.producer.stream,
            config.kinesis.producer);

    return function action(event) {
        var data = event.data;
        var date = data.date;
        var org = data.org;
        var paymentPlanStart = org.paymentPlanStart;

        if(paymentPlanStart && moment(date).isSame(paymentPlanStart, 'day')) {
            log.info('Org %1 has a payment plan that starts the day of %2', org.id, date);
            return producer.produce({
                type: 'paymentPlanWillStart',
                data: {
                    org: org
                }
            });
        } else {
            log.trace('Org %1 does not have a payment plan that starts the day of %2', org.id,
                date);
            return Q.resolve();
        }
    };
};
