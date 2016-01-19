'use strict';

var AWS = require('aws-sdk');
var Q = require('q');

/**
* Provides a simple way to produce JSON records into an Amazon Kinesis stream.
*
* @class JsonProducer
* @constructor
* @param {String} streamName The name of the Kinesis stream.
* @param {Object} options passed to the AWS.Kinesis constructor.
*/
function JsonProducer(streamName, options) {
    var opts = options || { };
    this.streamName = streamName;
    this.kinesis = new AWS.Kinesis(opts);
}
JsonProducer.prototype = {
    /**
    * Produces a record into the Amazon Kinesis stream.
    *
    * @method produce
    * @param {Object} object The JSON object to produce into the stream.
    * @param {String} [partitionKey] A partition key for the record. It will default to the current
    *   Epoch time.
    * @return {Promise} Resolves with data or rejects with an error message.
    */
    produce: function(object, partitionKey) {
        var self = this;
        var string = JSON.stringify(object);
        var key = partitionKey || Date.now().toString();
        var params = {
            Data: string,
            PartitionKey: key,
            StreamName: self.streamName
        };
        return Q.Promise(function(resolve, reject) {
            self.kinesis.putRecord(params, function(error, data) {
                if(error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    }
};

module.exports = JsonProducer;
