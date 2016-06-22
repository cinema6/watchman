'use strict';

var JsonProducer 		= require('rc-kinesis').JsonProducer,
	CwrxRequest			= require('../../lib/CwrxRequest'),
	resolveURL 			= require('url').resolve,
	logger 				= require('cwrx/lib/logger.js'),
	q 					= require('q'),
	log					= logger.getLog();

var objLrg, objSml;

module.exports = function fetchProductDataFactory(config) {
	var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
	var dataEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.productData.endpoint);
    var campEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);

	function isEqual(object1, object2) {
	    if (typeof object1 === 'object') {
	        if (typeof object2 === 'object') {
	            if (object1 === null) {
	                if (object2 === null) {
	                    return true;
	                }
	                else {return false;}
	            }

	            if (Object.keys(object1).length>=Object.keys(object2).length) {
	                objLrg = object1;
	                objSml = object2;
	            }
	            else {
	                objLrg = object2;
	                objSml = object1;
	            }

	            for (var prop in objLrg) {
	                if (typeof objLrg[prop] === 'undefined') {
	                    if (typeof objSml[prop] !== 'undefined') { //if obj 1 is undef only
	                        return false;
	                    }
	                }
	                else if (typeof objSml[prop] === 'undefined') { //if obj2 is undef only
	                    return false;
	                }
	                else if (objLrg[prop] !== objSml[prop]) {
	                     //if different values for same property
	                        for (var subProp in objLrg[prop]) {
	                            //if either has subProperties, perform recursion
	                            if (typeof objLrg[prop][subProp] !== 'undefined') {
	                                return isEqual(objLrg[prop], objSml[prop]);
	                            }
	                            else if (typeof objSml[prop][subProp] !== 'undefined') {
	                                return isEqual(objLrg[prop], objSml[prop]);
	                            }
	                        }
	                        //otherwise property values aren't equal
	                        return false;
	                }
	            }
	            return true; //if iterated through all and didn't return false
	        }
	        else { //if one is an object but the other isn't
	            return false;
	        }
	    }
	    else {
	        if (object1===object2) { //handles non-objects
	            return true;
	        }
	        else {return false;} //handles type mismatch
	    }
	}

	return function fetchProductData(event) {
		var campaign = event.data.campaign;
		var id = campaign.id;
		return request.get({
			url: dataEndpoint,
			qs: {uri: campaign.product.uri}
		}).then(function (data) {
			if (isEqual(campaign.product.data, data)) {
				data.name = campaign.product.name;
				data.description = campaign.product.description;
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
