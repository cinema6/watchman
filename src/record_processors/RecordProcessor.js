'use strict';

var Q = require('q');
var logger = require('cwrx/lib/logger.js');

/**
* The record processor must provide three functions:
*
* * `initialize` - called once
* * `processRecords` - called zero or more times
* * `shutdown` - called if this KCL instance loses the lease to this shard
*
* Notes:
* * All of the above functions take additional callback arguments. When one is
* done initializing, processing records, or shutting down, callback must be
* called (i.e., `completeCallback()`) in order to let the KCL know that the
* associated operation is complete. Without the invocation of the callback
* function, the KCL will not proceed further.
* * The application will terminate if any error is thrown from any of the
* record processor functions. Hence, if you would like to continue processing
* on exception scenarios, exceptions should be handled appropriately in
* record processor functions and should not be passed to the KCL library. The
* callback must also be invoked in this case to let the KCL know that it can
* proceed further.
*
* This class is not meant to be used on its own. When extending the
* functionality of this class you must override its "name" and "processor"
* properties.
*
* @class RecordProcessor
* @param {EventProcessor} eventProcessor An event processor used to process decoded json records.
* @constructor
*/
function RecordProcessor(eventProcessor) {
    if(!eventProcessor) {
        throw new Error('Must provide an event processor');
    }
    this.name = eventProcessor.name + ' record processor';
    this.processor = eventProcessor;
    this.shardId = null;
}
RecordProcessor.prototype = {
    /**
    * Called once by the KCL before any calls to processRecords. Any initialization
    * logic for record processing can go here.
    *
    * @param {Object} initializeInput Initialization related information.
    *   Looks like - {"shardId":"<shard_id>"}
    * @param {Function} completeCallback The callback that must be invoked once the initialization
    *   operation is complete.
    */
    initialize: function(initializeInput, completeCallback) {
        var log = logger.getLog();
        this.shardId = initializeInput.shardId;
        log.info('[%1] Initializing with shard %2', this.name, this.shardId);
        completeCallback();
    },

    /**
    * Called by KCL with a list of records to be processed and checkpointed.
    * A record looks like:
    *   {"data":"<base64 encoded string>","partitionKey":"someKey","sequenceNumber":"1234567890"}
    *
    * The checkpointer can optionally be used to checkpoint a particular sequence
    * number (from a record). If checkpointing, the checkpoint must always be
    * invoked before calling `completeCallback` for processRecords. Moreover,
    * `completeCallback` should only be invoked once the checkpoint operation
    * callback is received.
    *
    * The RecordProcessor decodes a record into JSON and passes it to a specified event
    * processor. A checkpoint occurs after processing a batch of records completes.
    *
    * @param {Object} processRecordsInput Process records information with
    *   array of records that are to be processed. Looks like -
    *   {"records":[<record>, <record>], "checkpointer":<Checkpointer>}
    *   where <record> format is specified above. The Checkpointer accepts
    *   a `string` or `null` sequence number and a callback.
    * @param {Function} completeCallback The callback that must be invoked
    *   once all records are processed and checkpoint (optional) is
    *   complete.
    */
    processRecords: function(processRecordsInput, completeCallback) {
        var log = logger.getLog();
        var self = this;

        // Ensure there are some records to process
        if(!processRecordsInput || !processRecordsInput.records ||
                processRecordsInput.records.length === 0) {
            completeCallback();
            return;
        }

        // Process each record and then checkpoint
        var records = processRecordsInput.records;
        log.info('[%1] Processing %2 records in shard %3', self.name, records.length, self.shardId);
        Q.allSettled(records.map(function(record) {
            return Q.resolve().then(function() {
                var data = new Buffer(record.data, 'base64').toString();
                var json = JSON.parse(data);
                var partitionKey = record.partitionKey;
                var sequenceNumber = record.sequenceNumber;
                log.trace('[%1] Processing record %2 with key %3 in shard %4', self.name,
                    sequenceNumber, partitionKey, self.shardId);
                return self.processor.process(json);
            });
        })).then(function(results) {
            results.forEach(function(result, index) {
                if(result.state !== 'fulfilled') {
                    var reason = result.reason;
                    var record = records[index];
                    log.warn('[%1] Failed to process record %2 with key %3 in shard %4: %5',
                        self.name, record.sequenceNumber, record.partitionKey, self.shardId,
                        reason);
                }
            });
            var checkpointer = processRecordsInput.checkpointer;
            var lastSequenceNumber = records[records.length - 1].sequenceNumber;
            return self.checkpoint(checkpointer, lastSequenceNumber).catch(function(error) {
                log.warn('[%1] Failed to checkpoint at %2 in shard %3: %4', self.name,
                    lastSequenceNumber, self.shardId, error);
            });
        }).then(function(checkpointSequenceNumber) {
            log.info('[%1] Checkpointed at %2 in shard %3', self.name, checkpointSequenceNumber,
                self.shardId);
            completeCallback();
        }).catch(function(error) {
            log.error('[%1] Error in shard %2: %3', self.name, self.shardId, error);
            completeCallback();
        });
    },

    /**
    * Called by KCL to indicate that this record processor should shut down.
    * After shutdown operation is complete, there will not be any more calls to
    * any other functions of this record processor. Note that reason
    * could be either TERMINATE or ZOMBIE. if ZOMBIE, clients should not
    * checkpoint because there is possibly another record processor which has
    * acquired the lease for this shard. If TERMINATE, then
    * `checkpointer.checkpoint()` should be called to checkpoint at the end of
    * the shard so that this processor will be shut down and new processors
    * will be created for the children of this shard.
    *
    * @param {Object} shutdownInput Shutdown information. Looks like -
    *   {"reason":"<TERMINATE|ZOMBIE>", "checkpointer":<Checkpointer>}
    *   The Checkpointer accepts a `string` or `null` sequence number
    *   and a callback.
    * @param {Function} The callback that must be invoked
    *   once shutdown-related operations are complete and checkpoint
    *   (optional) is complete.
    */
    shutdown: function(shutdownInput, completeCallback) {
        var log = logger.getLog();
        var reason = shutdownInput.reason;
        var self = this;

        log.info('[%1] Shutting down with shard %2 because %3', self.name, self.shardId, reason);
        Q.resolve().then(function() {
            if(reason === 'TERMINATE') {
                return self.checkpoint(shutdownInput.checkpointer).then(function(sequenceNumber) {
                    log.info('[%1] Checkpointed on shutdown at %2 in shard %3', self.name,
                        sequenceNumber, self.shardId);
                }).catch(function(error) {
                    log.warn('[%1] Failed to checkpoint on shutdown in shard %2: %3', self.name,
                        self.shardId, error);
                });
            }
        }).then(function() {
            completeCallback();
        }).catch(function(error) {
            log.error('[%1] Error in shard %2: %3', self.name, self.shardId, error);
            completeCallback();
        });
    },

    /**
    * Attempts to perform a checkpoint operation.
    *
    * @param {Checkpointer} checkpointer A checkpointer object from the Node aws-kcl API.
    * @param {String} [sequenceNumber] A sequence number indicating the record at which to
    *   checkpoint. Defaults to null.
    * @return {Promise} Resolves with the seuqence number at which the checkpoint was performed or
    *   rejects with an error message.
    */
    checkpoint: function(checkpointer, sequenceNumber) {
        return Q.Promise(function(resolve, reject) {
            var sequenceNum = sequenceNumber || null;
            checkpointer.checkpoint(sequenceNum, function(error, checkpointSequenceNumber) {
                if(error) {
                    reject(error);
                } else {
                    resolve(checkpointSequenceNumber);
                }
            });
        });
    }
};

module.exports = RecordProcessor;
