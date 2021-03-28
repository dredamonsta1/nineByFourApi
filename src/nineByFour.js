window.addEventListener("load", function() {

    const submitBtn = document.querySelector('submit');
    const rapperForm = document.getElementById(
        'rapperForm', 
        'artistName',
        'stageName',
        'home',
        'recordLabel',
        'numberOfAlbums',
        'albumName',
        'albumYear',
        'diamondCert',
        'multiPlatinumCert',
        'platinumCert',
        'goldCert',
        'billboardHot',
        'billboard200',
        'billboardHotRAndB',
        'topBillboard',
        'submit'
        );
        // const rapperForm = document.getElementById('rapperForm');
        
        submitBtn.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log("hey");
        });
        
    });