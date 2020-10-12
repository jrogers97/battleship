const findIndexByAttr = (arr: any[], attr: any, value: any) => {
	for (var i = 0; i < arr.length; i += 1) {
		if (arr[i][attr] === value) {
			return i;
		}
	}
	return -1;
}

module.exports = { findIndexByAttr }