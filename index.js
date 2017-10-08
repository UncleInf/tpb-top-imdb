// ==UserScript==
// @name                tpb-top-imdb
// @namespace           uncleinf
// @version             0.7
// @description         Loads imdb rating info for top100 search results
// @author              UncleInf
// @license             MIT
// @supportURL          https://github.com/UncleInf/tpb-top-imdb
// @contributionURL     https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=HYV6Z2N9BA5V8
// @contributionAmount  5
// @require             https://code.jquery.com/jquery-3.2.1.min.js
// @require             https://cdnjs.cloudflare.com/ajax/libs/store2/2.5.7/store2.min.js
// @include             http*://thepiratebay.*/top/207
// @include             http*://thepiratebay.*/top/201
// @include             http*://thepiratebay.*/top/202
// @include             http*://thepiratebay.*/top/205
// @include             http*://thepiratebay.*/top/208
// @include             http*://thepiratebay.*/top/209
// @grant               GM_xmlhttpRequest
// @connect             theimdbapi.org
// ==/UserScript==

(function() {
    'use strict';
    /* global $, store */

    $(function() {
        addHeader();
        $('tr').each(addRating);
    });

    function addHeader() {
        var header = $('<th>').attr('title', '6.5 - 7.2 - 8'),
            a = $('<a>').attr('href', '#').text('Rating').click(refreshRatings);

        header.append(a);
        $('th').parent().prepend(header);
    }

    function refreshRatings(e) {
        e.preventDefault();

        clearData();
        $('tr').each(addRating);
    }

    function clearData() {
        var ratingCells = $('.tpb-top-imdb');
        
        ratingCells.find('a').text('');
        ratingCells.attr('style', '');

        store.clearAll();
    }

    function addRating() {
        var row = $(this),
            link = row.find('.detLink').attr('href');

        //there is no link - it is not downloadable coontent (th)
        if (!link) {
            return;
        }

        var elements = findElements(row),
            td = elements.td,
            center = elements.center;

        getData(link)
            .then(function(data) {
                displayRating(data, td, center);
            })
            .fail(function(error) {
                badData(error, center);
            });
    }

    function findElements(row) {
        var td = row.find('.tpb-top-imdb'),
            center;

        if (td.length > 0) {
            center = td.find('center');
        } else {
            td = $('<td>').addClass('vertTh tpb-top-imdb');
            center = $('<center>');
            row.prepend(td.append(center));
        }

        return {
            td: td,
            center: center
        };
    }

    function getData(link) {
        var deferred = new $.Deferred(),
            linkId = parseLinkId(link);

        if (!linkId) {
            console.log('Couldnt get linkId in url');
            deferred.reject(iDontKnow());
        }

        if (store.has(linkId)) {
            deferred.resolve(store.get(linkId));
        } else {
            getAndSaveNewData(link, linkId)
                .done(function() {
                    deferred.resolve(store.get(linkId));
                })
                .fail(deferred.reject);
        }

        return deferred.promise();
    }

    function parseLinkId(link) {
        var split = link.split('/');
        return split && split.length >= 3 ? split[2] : null;
    }

    function getAndSaveNewData(link, linkId) {
        return $.get(link)
            .then(extractImdbId)
            .then(getImdbData)
            .then(function(data) {
                persistData(data, linkId);
            });
    }

    function extractImdbId(resp) {
        var deferred = new $.Deferred();

        var regexp = 'www.imdb.com/title/(.*)/"',
            regexFind = resp.match(regexp),
            id = regexFind && regexFind.length === 2 ? regexFind[1] : null;

        if (id) {
            deferred.resolve(id);
        } else {
            // console.log('Could not parse IMDB id');
            deferred.reject(iDontKnow());
        }

        return deferred.promise();
    }

    function getImdbData(imdbId) {
        var deferred = new $.Deferred();

        var apiUrl = 'https://theimdbapi.org/api/movie?movie_id=' + imdbId;
        $.getJSON(apiUrl)
            .done(function(resp) {
                var data = {
                    url: resp.url.url,
                    rating: Number.parseFloat(resp.rating),
                    ratingCount: resp.rating_count
                };
                deferred.resolve(data);
            })
            .error(deferred.reject);

        return deferred.promise();
    }

    function persistData(data, id) {
        store.set(id, data);
        return $.when();
    }

    function displayRating(data, td, center) {
        var a = center.find('a');

        if (a.length === 0) {
            a = $('<a>').text(data.rating).attr('href', data.url);
            center.append(a);
        } else {
            a.text(data.rating);
        }

        td.css(getRatingStyles(data.rating));
        td.attr('title', data.ratingCount);
    }

    function badData(message, element) {
        element.text(message);
    }

    function getRatingStyles(rating) {
        var colour = '';

        if (rating >= 8) {
            colour = 'palegreen';
        } else if (rating >= 7.2) {
            colour = 'powderblue';
        } else if (rating >= 6.5) {
            colour = 'lightcyan';
        }

        return {
            'background-color': colour
        };
    }

    function iDontKnow() {
        // return '¯\\_(ツ)_/¯';
        return '--';
    }
})();
