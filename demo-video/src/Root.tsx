import React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from './compositions/MainHackathonDemo';
import { AmbientLoop } from './compositions/AmbientLoop';
import { BackdropMotion } from './compositions/BackdropMotion';
import { VideoPropsSchema, type VideoProps } from './types';
import defaultPropsRaw from './config/default-data.json';

const defaultProps = VideoPropsSchema.parse(defaultPropsRaw);
// Composición dev rápida: solo la primera escena (450f) para iterar.
const heroProps: VideoProps = { ...defaultProps, scenes: [defaultProps.scenes[0]] };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HackathonDemo"
        component={MainComposition}
        durationInFrames={5400}
        fps={30}
        width={1920}
        height={1080}
        schema={VideoPropsSchema}
        defaultProps={defaultProps}
      />
      <Composition
        id="HackathonShort"
        component={MainComposition}
        durationInFrames={5400}
        fps={30}
        width={1080}
        height={1920}
        schema={VideoPropsSchema}
        defaultProps={defaultProps}
      />
      <Composition
        id="HeroCheck"
        component={MainComposition}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        schema={VideoPropsSchema}
        defaultProps={heroProps}
      />
      <Composition
        id="AmbientLoop"
        component={AmbientLoop}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ vignette: true }}
      />
      <Composition
        id="BackdropMotion"
        component={BackdropMotion}
        durationInFrames={5400}
        fps={30}
        width={1920}
        height={1080}
        schema={VideoPropsSchema}
        defaultProps={defaultProps}
      />
    </>
  );
};
