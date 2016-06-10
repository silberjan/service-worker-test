function alertTemporaryQuota()
{
	navigator.webkitTemporaryStorage.queryUsageAndQuota( 
		quotaSuccessCallback, 
		quotaErrorCallback
	);
}

function alertPersistentQuota()
{
	navigator.webkitPersistentStorage.queryUsageAndQuota( 
		quotaSuccessCallback, 
		quotaErrorCallback
	);
}

function quotaSuccessCallback(usedBytes, grantedBytes)
{  
	alert(Math.round(usedBytes / 1024 / 1024)+'MB / '+Math.round(grantedBytes / 1024 / 1024)+'MB');
}

function quotaErrorCallback(e)
{
	alert('Error getting the Quota', e);
}