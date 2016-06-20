'use strict';

var JsonProducer 		= require('rc-kinesis').JsonProducer,
	CwrxRequest			= require('../../lib/CwrxRequest'),
	resolveURL 			= require('url').resolve,
	logger 				= require('cwrx/lib/logger.js'),
	q 					= require('q'),
	log					= logger.getLog();

module.exports = function fetchProductDataFactory(config) {
	var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
	var dataEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.productData.endpoint);
    var campEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

	return function fetchProductData(event) {
		var campaign = event.data.campaign;
		var id = campaign.id;
		return request.get({
			url: dataEndpoint,
			qs: {uri: campaign.product.uri}
		}).then(function (data) {
			if (campaign.product !== data) {
				delete data.name;
				delete data.description;
				return request.put({
					url: campEndpoint + '/' + id,
					json: {product: data}
				});
			}
			else {
				log.info('No data changes to update [%1]', id);
				return q.reject('No data changes to update');
			}
		}).then(function() {
				return watchmanStream.produce({
                    type: 'campaignRefreshed',
                    data: {
                        campaign: campaign,
                        date: new Date()
                    }
                });
		}).catch(function(error) {
			log.info(error);
		});
	};
};
