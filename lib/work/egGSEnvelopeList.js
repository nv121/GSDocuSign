const docusign = require('docusign-esign')
    , dsConfig = require('../../ds_configuration.js').config
    , moment = require('moment')
    , path = require('path')
;

const egGSEnvelopeList = exports
    , eg = 'egGS' // This example reference.
    , mustAuthenticate = '/ds/mustAuthenticate'
    , minimumBufferMin = 3
;

//empty JavaScript object for envelope ID
//var myObject = {};
//empty array to hold JavaScript Object
var arr =[];

//var envelopeId = 'envelopeID'
/**
 * List envelopes in the user's account
 * @param {object} req Request obj
 * @param {object} res Response obj
 */
egGSEnvelopeList.createController = async (req, res,next) => {
    // Step 1. Check the token
    // At this point we should have a good token. But we
    // double-check here to enable a better UX to the user.
    let tokenOK = req.dsAuthCodeGrant.checkToken(minimumBufferMin);
    if (! tokenOK) {
        req.flash('info', 'Sorry, you need to re-authenticate.');
        // We could store the parameters of the requested operation
        // so it could be restarted automatically.
        // But since it should be rare to have a token issue here,
        // we'll make the user re-enter the form data after
        // authentication.
        req.dsAuthCodeGrant.setEg(req, eg);
        res.redirect(mustAuthenticate);
    }

    // Step 2. Call the worker method
    let args = {
            accessToken: req.user.accessToken,
            basePath: req.session.basePath,
            accountId: req.session.accountId,
        }
        , results = null
    ;

    try {
        results = await egGSEnvelopeList.worker (args)
    }
    catch (error) {
        let errorBody = error && error.response && error.response.body
            // we can pull the DocuSign error code and message from the response body
            , errorCode = errorBody && errorBody.errorCode
            , errorMessage = errorBody && errorBody.message
        ;
        // In production, may want to provide customized error messages and
        // remediation advice to the user.
        res.render('pages/error', {err: error, errorCode: errorCode, errorMessage: errorMessage});
    }
    //This the function I need
    if (results) {
        req.session.envelopeId = arr; // Save for use by other examples
        res.render('pages/example_done', {
            title: "List envelopes results",
            h1: "Envelopes updated",
            message: `Results from the Envelopes::listStatusChanges method:ID ${arr}`,
            json: JSON.stringify(results)


        }
        );
    }


}

/**
 * This function does the work of listing the envelopes
 */
// ***DS.snippet.0.start
egGSEnvelopeList.worker = async (args) => {
    // Data for this method
    // args.basePath
    // args.accessToken
    // args.accountId


    let dsApiClient = new docusign.ApiClient();
    dsApiClient.setBasePath(args.basePath);
    dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + args.accessToken);
    let envelopesApi = new docusign.EnvelopesApi(dsApiClient)
        , results = null;

    // Step 1. List the envelopes
    // The Envelopes::listStatusChanges method has many options
    // See https://developers.docusign.com/esign-rest-api/reference/Envelopes/Envelopes/listStatusChanges

    // The list status changes call requires at least a from_date OR
    // a set of envelopeIds. Here we filter using a from_date.
    // Here we set the from_date to filter envelopes for the last month
    // Use ISO 8601 date format

    let options = {fromDate: moment().subtract(30, 'days').format(),
                    status: 'completed'};
    // console.log(typeof(options))
    // Exceptions will be caught by the calling function
    results = await envelopesApi.listStatusChanges(args.accountId, options);
    //console.log(results)
    //get count of envelopes
    ct = results.totalSetSize
    console.log(ct)
    //var myEnvelopes = JSON.stringify(results.envelopes);
   // myResults = JSON.parse(myEnvelopes)
//TO DO: check for duplicates

//loop through all completed envelopes and output envelope id
    for (var i = 0; i < ct; i++) {
        //console.log(JSON.stringify(results.envelopes[i]['envelopeId']))
        let id = results.envelopes[i]['envelopeId']
        //error handling to make sure we dont have redundent envelopeIds
        //
        arr.push(id);
     }
   // console.log(arr)
    ;
    //results prints all key: value of envelopes
    //return results;
    //arr only returns
    return arr;

}

// ***DS.snippet.0.end

/**
 * Form page for this application
 */
egGSEnvelopeList.getController = (req, res) => {
    // Check that the authentication token is ok with a long buffer time.
    // If needed, now is the best time to ask the user to authenticate
    // since they have not yet entered any information into the form.
    let tokenOK = req.dsAuthCodeGrant.checkToken();
    if (tokenOK) {
        res.render('pages/work/egGSEnvelopeList', {
            eg: eg, csrfToken: req.csrfToken(),
            title: "List envelopes",
            sourceFile: path.basename(__filename),
            sourceUrl: dsConfig.githubExampleUrl + path.basename(__filename),
            documentation: dsConfig.documentation + eg,
            showDoc: dsConfig.documentation
        });
    } else {
        // Save the current operation so it will be resumed after authentication
        req.dsAuthCodeGrant.setEg(req, eg);
        res.redirect(mustAuthenticate);
    }
}


