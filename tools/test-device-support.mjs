import test from 'node:test';
import assert from 'node:assert/strict';
import { isPhoneDevice } from '../src/device-support.js';

for (const [name, device] of [
  ['iPhone portrait', {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',screenWidth:393,screenHeight:852,maxTouchPoints:5,coarsePointer:true}],
  ['iPhone landscape', {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',screenWidth:852,screenHeight:393,maxTouchPoints:5,coarsePointer:true}],
  ['iPhone desktop-site mode', {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',screenWidth:852,screenHeight:393,maxTouchPoints:5,coarsePointer:true}],
  ['Android phone', {userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Mobile Safari/537.36',screenWidth:412,screenHeight:915,mobile:true,maxTouchPoints:5,coarsePointer:true}],
  ['unfolded phone', {userAgent:'Mozilla/5.0 (Linux; Android 15) Mobile Safari/537.36',screenWidth:900,screenHeight:1000,mobile:true,maxTouchPoints:5,coarsePointer:true}],
]) test(`${name} uses the availability page`,()=>assert.equal(isPhoneDevice(device),true));

for (const [name, device] of [
  ['Mac laptop', {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',screenWidth:1440,screenHeight:900}],
  ['desktop with a narrow window', {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',screenWidth:1920,screenHeight:1080}],
  ['touch laptop', {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',screenWidth:1920,screenHeight:1080,maxTouchPoints:10,coarsePointer:true}],
  ['small touch laptop', {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',screenWidth:1024,screenHeight:600,maxTouchPoints:10,coarsePointer:true}],
]) test(`${name} retains the portfolio`,()=>assert.equal(isPhoneDevice(device),false));
