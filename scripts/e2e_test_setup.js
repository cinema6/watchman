'use strict';

const Hubspot = require('../lib/Hubspot.js');

const SECRETS = JSON.parse(process.env.secrets);
const HUBSPOT_API_KEY = SECRETS.hubspot.key;

const hubspot = new Hubspot(HUBSPOT_API_KEY);

// Ensure there is no e2e contacts in Hubspot
const deleteContact = email => {
    return hubspot.getContactByEmail(email).then(contact => {
        if(contact) {
            return hubspot.deleteContact(contact.vid);
        }
    });
};
Promise.all([
    deleteContact('c6e2etester@gmail.com'),
    deleteContact('c6e2etester2@gmail.com')
]).catch(error => {
    throw error;
});
