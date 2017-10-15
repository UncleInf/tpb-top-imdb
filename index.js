// ==UserScript==
// @name                tpb-top-imdb
// @namespace           uncleinf
// @version             0.9
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


(function () {
    'use strict';
    /* global $, store */

    var toggleButton = function(k, t) {
        var key = k,
            text = t,
            element,
            count,
            matchingElements = [],
            notMatchingElements = [],

            initStore = function() {
                if (isShown() === null) {
                    setValue(true);
                }
            },

            initElement = function() {
                return $('<a>').attr('href', '#')
                    .click(onClick)
                    .text(getButtonText());
            },

            initCount = function() {
                return $('<span>');
            },

            onClick = function(e) {
                e.preventDefault();
        
                invertValue();
                element.text(getButtonText());
                refreshRatings();
            },

            invertValue = function() {
                setValue(!isShown());
            },

            getButtonText = function() {
                return (isShown() ? 'Hide ' : 'Show ') + text;
            },

            toShow = function(id) {
                if (matchingElements.includes(id)) {
                    notMatchingElements.push(id);
                    return isShown();
                } else {
                    matchingElements.push(id);
                    return true;
                }
            },

            clearSavedData = function() {
                matchingElements = [];
                notMatchingElements = [];
            },

            updateCountCount = function() {
                count.text(notMatchingElements.length);
            },

            getButton = function() {
                return $('<span>').append(
                    element,
                    ' (', count, ') / '
                );
            },

            isShown = function() {
                return store.get(key);
            },

            setValue = function(value) {
                store.set(key, value);
            };

        (function() {
            initStore();
            element = initElement();
            count = initCount();
        }());

        return {
            getButton: getButton,
            toShow: toShow,
            clearSavedData: clearSavedData,
            updateCountCount: updateCountCount
        };
    };


    var dublicatesButton = toggleButton('showDublicates', 'dublicates'),
        noInfoButton = toggleButton('showNoInfoItems', 'no info items'),
        lowRatingButton = toggleButton('showLowRatings', 'low rating'),
        watchedItems = toggleButton('showWatched', 'watched');

    var actions = [];

    $(function () {
        addHeader();
        addOptions();
        refreshRatings();
    });

    function addHeader() {
        var header = $('<th>').attr('title', '6.5 - 7.2 - 8'),
            a = $('<a>').attr('href', '#').text('Rating').click(refreshRatingsData);

        header.append(a);
        $('th').parent().prepend(header);
    }

    function addOptions() {
        var filteredCount = $('<span>').attr('id', 'filteredCount'),
            optionsCell = $('<td>')
                .attr('colspan', $('th').length)
                .append(
                    dublicatesButton.getButton(),
                    noInfoButton.getButton(),
                    lowRatingButton.getButton(),
                    watchedItems.getButton(),
                    ' / visible - ', filteredCount                    
                );

        $('tbody').prepend($('<tr>').addClass('tpb-imdb-options').append(optionsCell));
    }

    function updateCount() {
        var extraLines = 2; //th, options row
        $('#filteredCount').text($('tr:visible').length - extraLines);

        dublicatesButton.updateCountCount();
    }

    function clearCount() {
        $('#filteredCount').text('--');
    }

    function refreshRatingsData(e) {
        e.preventDefault();

        clearData();
        refreshRatings();
    }

    function refreshRatings() {
        var rows = getActualrows();
        
        clearCount();

        rows.each(addRating);

        $.when.apply($, actions).done(function() {
            rows.each(hideRows);
            updateCount();
            cleanUpGlobals();
        });
    }

    function getActualrows() {
        return $('tr').not('.tpb-imdb-options').filter(function() {
            var children = $(this).children();
            return !(children.eq(0).is('th'));
        });
    }

    function clearData() {
        var ratingCells = $('.tpb-top-imdb');

        ratingCells.find('a').text('');
        ratingCells.attr('style', '');

        store.clearAll();
    }

    function hideRows() {
        var row = $(this),
            imdbId = row.data('imdbId');

        row.toggle(dublicatesButton.toShow(imdbId));
    }

    function addRating() {
        var row = $(this),
            link = row.find('a[href^="/torrent/"]').attr('href');

        //there is no link - it is not downloadable coontent (th)
        if (!link) {
            return;
        }

        var elements = findElements(row),
            td = elements.td,
            center = elements.center,
            deferred = new $.Deferred();
        
        getData(link)
            .then(function (data) {
                if (!row.data('imdbId')) {
                    row.data('imdbId', data.imdbId);
                }
                displayRating(data, td, center);
                deferred.resolve();
            })
            .fail(function (error) {
                badData(error, center);

                deferred.reject();
            });

        return deferred.promise(); 
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
            doneGettingImdbId(deferred);
            deferred.resolve(store.get(linkId));
        } else {
            getAndSaveNewData(link, linkId)
                .done(function () {
                    deferred.resolve(store.get(linkId));
                })
                .fail(function() {
                    deferred.reject(iDontKnow());
                });
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
            .then(function (data) {
                persistData(data, linkId);
            });
    }

    function extractImdbId(resp) {
        var deferred = new $.Deferred();

        var regexp = 'www.imdb.com/title/(.*)/"',
            regexFind = resp.match(regexp),
            id = regexFind && regexFind.length === 2 ? regexFind[1] : null;

        if (id) {
            doneGettingImdbId(deferred);
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
            .done(function (resp) {
                var data = {
                    imdbId: imdbId,
                    url: resp.url.url,
                    rating: Number.parseFloat(resp.rating),
                    ratingCount: resp.rating_count
                };
                deferred.resolve(data);
            })
            .fail(function () {
                deferred.reject(iDontKnow());
            });

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

    function doneGettingImdbId(deferred) {
        actions.push(deferred);
    }

    function cleanUpGlobals() {
        actions = [];
        dublicatesButton.clearSavedData();
    }

    function iDontKnow() {
        // return '¯\\_(ツ)_/¯';
        return '--';
    }
})();