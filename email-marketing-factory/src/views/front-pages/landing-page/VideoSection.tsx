// Third-party Imports
import classnames from 'classnames'

// Hook Imports
import frontCommonStyles from '@views/front-pages/styles.module.css'

const VideoSection = () => {
  return (
    <section>
      <div className={classnames('flex flex-col gap-12', frontCommonStyles.layoutSpacing)}>
        <video className='w-[100%] h-[500px] rounded max-md:h-[350px]' controls src={'video/ad_video.mp4#t=0.002'} >
          <track
            src="/path/to/captions.vtt"
            kind="subtitles"
            srcLang="en"
            label="English"
          />
        </video>
      </div>
    </section>
  )
}

export default VideoSection
