const { Firestore } = require('@google-cloud/firestore');


class FireStoreConnection{

    constructor(settings){
        this.firestore = new Firestore(settings);
    }

}

module.exports = FireStoreConnection