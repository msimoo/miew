import _ from 'lodash';

function _isWhitespace(ch) {
  return ch === 32 || ch === 10 || ch === 13 || ch === 9;
}

function _inlineIndexOf(ch0, str, idx) {
  const len = str.length;
  let ch = -1;
  while (idx < len) {
    ch = str.charCodeAt(idx);
    if (ch === ch0 || ch === 10) {
      break;
    }
    ++idx;
  }
  return ch === ch0 ? idx : -1;
}

export default function readCIF(source) {
  let i = 0;
  let j = 0;
  const n = source.length;
  let code = NaN;
  let newline = true;
  let line = 1;
  let column = 1;
  let begin;
  let state = 0; // -1 - stop, 0 - start, 1 - block, 2 - item, 3 - loop, 4 - values, 5 - value, 666 - error
  let err = 'unexpected character';
  const result = {};
  let block = {};
  let keys = [];
  let keysCount = 0;
  let key = '';
  let values = [];
  let valuesCount = 0;
  let value;

  function _parseValue() {
    let val;
    if ((code === 46 || code === 63) && (i + 1 >= n || _isWhitespace(source.charCodeAt(i + 1)))) { // '.' or '?' .....
      // it's a missing value
      ++column;
      ++i;
      return undefined;
    }
    if (newline && code === 59) { // ';' ......................................................................
      // parse multi-line string
      j = i;
      let lines = 0;
      do {
        j = _inlineIndexOf(10, source, j + 1); // '\n'
        if (j === -1) {
          err = 'unterminated text block found';
          return null;
        }
        ++lines;
      } while ((j + 1 < n && source.charCodeAt(j + 1) !== code) || j + 1 >= n);
      val = source.substring(i + 1, j).replace(/\r/g, '');
      i = j + 2;
      line += lines;
      column = 1;
      newline = false;
      return val;
    }
    if (code === 39 || code === 34) { // ''' or '"' ...........................................................
      // parse quoted string
      j = i;
      do {
        j = _inlineIndexOf(code, source, j + 1);
        if (j === -1) {
          err = 'unterminated quoted string found';
          return null;
        }
      } while (j + 1 < n && !_isWhitespace(source.charCodeAt(j + 1)));
      val = source.substring(i + 1, j);
      column += j - i + 1;
      i = j + 1;
      return val;
    } // ......................................................................................................
    // parse until the first whitespace
    j = i;
    while (j < n && !_isWhitespace(source.charCodeAt(j))) {
      ++j;
    }
    val = source.substring(i, j);
    column += j - i;
    i = j;
    // try to convert to a number
    const num = Number(val);
    if (!Number.isNaN(num)) {
      return num;
    }
    // or leave as an unquoted string
    return val;
  }

  function _storeKey(tag) {
    keys[keysCount++] = tag;
  }

  function _storeValue(val) {
    const keyIndex = valuesCount % keysCount;
    values[keyIndex].push(val);
    ++valuesCount;
    return val;
  }

  while (i <= n) {
    code = source.charCodeAt(i); // 'NaN' in place of '<eof>'
    if (code === 13) { // '\r' .......................................................................................
      // just ignore
    } else if (code === 10) { // '\n' ................................................................................
      // take note of new lines
      newline = true;
      ++line;
      column = 1;
    } else {
      // process inline characters
      if (code === 32 || code === 9) { // ' ' or '\t' ................................................................
        // just ignore
      } else if (code === 35) { // '#' ...............................................................................
        // skip the comment until before the end of the line
        i = _inlineIndexOf(10, source, i + 1); // '\n'
        if (i === -1) {
          break;
        } else {
          continue; // don't forget to process the new line
        }
      } else if (state === 0) { // start =============================================================================
        if ((code === 68 || code === 100) && source.substr(i + 1, 4).toLowerCase() === 'ata_') { // 'data_' ..........
          j = i + 5;
          begin = j;
          while (j < n && !_isWhitespace(source.charCodeAt(j))) {
            ++j;
          }
          column += j - i;
          i = j;
          if (begin < i) {
            // add new data block
            result[source.substring(begin, i)] = block = {};
            state = 1; // block
            continue; // don't forget to process the whitespace
          } else {
            err = 'data block name missing';
            state = 666; // error
            break;
          }
        } else if (Number.isNaN(code)) { // <eof> ....................................................................
          break;
        } else { // ..................................................................................................
          err += ` in state ${state}`;
          state = 666; // error
          break;
        }
      } else if (state === 1) { // block =============================================================================
        if ((code === 68 || code === 100) && source.substr(i + 1, 4).toLowerCase() === 'ata_') { // 'data_' ..........
          state = 0; // start
          continue; // parse again in a different state
        } else if (code === 95) { // '_' .............................................................................
          j = i + 1;
          begin = j;
          while (j < n && !_isWhitespace(source.charCodeAt(j))) {
            ++j;
          }
          column += j - i;
          i = j;
          if (begin < i) {
            // start new item
            key = source.substring(begin, i);
            state = 2; // item
            continue; // don't forget to process the whitespace
          } else {
            err = 'tag name missing';
            state = 666; // error
            break;
          }
        } else if ((code === 76 || code === 108) && source.substr(i + 1, 4).toLowerCase() === 'oop_') { // 'loop_' ...
          i += 5;
          column += 5;
          if (i < n && !_isWhitespace(source.charCodeAt(i))) {
            err += ` in state ${state}`;
            state = 666; // error
            break;
          } else {
            // start new loop
            keys = [];
            keysCount = 0;
            values = [];
            valuesCount = 0;
            state = 3; // loop
            continue; // don't forget to process the whitespace
          }
        } else if (Number.isNaN(code)) { // <eof> ....................................................................
          break;
        } else { // ..................................................................................................
          err += ` in state ${state}`;
          state = 666; // error
          break;
        }
      } else if (state === 2) { // item ==============================================================================
        if (Number.isNaN(code)) {
          break;
        } else if ((value = _parseValue()) !== null) { // eslint-disable-line no-cond-assign
          _.set(block, key, value);
          state = 1; // block
          continue;
        }
        state = 666;
        break;
      } else if (state === 3) { // loop ==============================================================================
        if (code === 95) { // '_' ....................................................................................
          j = i + 1;
          begin = j;
          while (j < n && !_isWhitespace(source.charCodeAt(j))) {
            ++j;
          }
          column += j - i;
          i = j;
          if (begin < i) {
            // add new key
            _storeKey(source.substring(begin, i));
            continue; // don't forget to process the whitespace
          } else {
            err = 'tag name missing';
            state = 666; // error
            break;
          }
        } else { // ..................................................................................................
          if (keysCount > 0) {
            for (let keyIndex = 0; keyIndex < keysCount; ++keyIndex) {
              value = [];
              values[keyIndex] = value;
              _.set(block, keys[keyIndex], value);
            }
            state = 4;
            continue; // parse again in a different state
          }
          err = 'data tags are missing inside a loop';
          state = 666; // error
          break;
        }
      } else if (state === 4) { // values ============================================================================
        if ((code === 68 || code === 100) && source.substr(i + 1, 4).toLowerCase() === 'ata_') { // 'data_' ..........
          state = 0; // start
        } else if (code === 95) { // '_' .............................................................................
          state = 1; // block
        } else if ((code === 76 || code === 108) && source.substr(i + 1, 4).toLowerCase() === 'oop_') { // 'loop_' ...
          state = 1; // block
        } else if (Number.isNaN(code)) { // <eof> ....................................................................
          state = 0;
        } else { // ..................................................................................................
          if (_storeValue(_parseValue()) !== null) {
            continue;
          }
          state = 666;
          break;
        }
        continue; // parse again in a different state
      } else { // ====================================================================================================
        err = `unexpected internal state ${state}`;
        state = 666; // error
        break;
      }

      newline = false;
      ++column;
    }
    ++i;
  }

  if (state === 2) { // item
    err = `unexpected end of file in state ${state}`;
    state = 666; // error
  }

  const ret = {
    data: result,
  };

  if (state === 666) { // error
    ret.error = {
      line,
      column,
      message: err,
    };
  }

  return ret;
}
