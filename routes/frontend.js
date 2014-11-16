/**
 * Created by roger on 8/29/14.
 */
'use strict';

exports.index = function(req, res){
    //if (req.isAuthenticated()) {
//        res.redirect('/admin');
  //  }
    //else {
        res.render('index', {
            oauthMessage: ''
        });
    //}
};

