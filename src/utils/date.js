/**
 * generates date in format: YYYY-MM-DD
 *
 * @return {string} - the formatted date
 */
export const getFormattedDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1) < 10 ? `0${now.getMonth() + 1}` : (now.getMonth() + 1);
  const date = now.getDate() < 10 ? `0${now.getDate()}` : now.getDate();
  return `${year}-${month}-${date}`;
};

export const getMonth = (month, abbreviated = false) => {
  switch (month) {
    case 0: return abbreviated ? 'Jan' : 'January';
    case 1: return abbreviated ? 'Feb' : 'February';
    case 2: return abbreviated ? 'Mar' : 'March';
    case 3: return abbreviated ? 'Apr' : 'April';
    case 4: return abbreviated ? 'May' : 'May';
    case 5: return abbreviated ? 'Jun' : 'June';
    case 6: return abbreviated ? 'Jul' : 'July';
    case 7: return abbreviated ? 'Aug' : 'August';
    case 8: return abbreviated ? 'Sep' : 'September';
    case 9: return abbreviated ? 'Oct' : 'October';
    case 10: return abbreviated ? 'Nov' : 'November';
    case 11: return abbreviated ? 'Dec' : 'December';
    default: return null;
  }
};
